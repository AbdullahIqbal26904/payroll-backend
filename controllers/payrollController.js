const db = require('../config/db');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const multer = require('multer');
const { formatSuccess, formatError } = require('../utils/helpers');
const Timesheet = require('../models/Timesheet');
const Payroll = require('../models/Payroll');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const { parse } = require('date-fns');
const { generatePaystubPDF } = require('../utils/pdfGenerator');

// Set up multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/csv'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for CSV and tab-delimited uploads
const csvFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(csv|txt|tsv)$/)) {
    return cb(new Error('Only CSV and tab-delimited files are allowed'), false);
  }
  cb(null, true);
};

// Initialize multer upload
exports.upload = multer({
  storage: storage,
  fileFilter: csvFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * @desc    Upload timesheet CSV
 * @route   POST /api/payroll/upload-timesheet
 * @access  Private/Admin
 */
exports.uploadTimesheet = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a CSV file'
      });
    }
    
    const filePath = req.file.path;
    const results = [];
    let errors = [];
    
    // Processing state
    let headerFound = false;
    let dateRangeFound = false;
    let dateRange = '';
    let reportTitle = '';
  let columnHeaders = [];
  let detectedStartDate = null;
  let detectedEndDate = null;
    
    // First read the file as raw text to detect proper formatting
    const fileData = fs.readFileSync(filePath, 'utf8');
    const lines = fileData.split('\n');
    
    // Check if there's at least 3 lines (header, date range, column headers)
    if (lines.length < 3) {
      throw new Error('File has insufficient data');
    }
    
  // First line should be the report title (strip trailing columns)
  const rawReportTitleLine = lines[0] || '';
  reportTitle = rawReportTitleLine.split(',')[0].trim() || 'Punch Report';
    console.log(`Found report title: ${reportTitle}`);
    
    // Second line should be date range
  const rawDateRangeLine = lines[1] || '';
  dateRange = rawDateRangeLine.split(',')[0].trim() || '';
    console.log(`Found date range: ${dateRange}`);
    
    // Determine the separator (tab or comma) by checking the third line
    const hasTabs = lines[2].includes('\t');
    const separator = hasTabs ? '\t' : ',';
    console.log(`Using separator: ${separator === '\t' ? 'tab' : 'comma'}`);
    
    // Extract report title and date range from the first two lines
    const csvStream = fs.createReadStream(filePath)
      .pipe(csv({
        skipLines: 2, // Skip title and date range lines
        headers: true, // Use the third line as headers
        separator: separator
      }));
    
    // Parse the CSV file
    for await (const row of csvStream) {
      console.log('Processing row:', JSON.stringify(row));
      
      // Process actual timesheet data
      try {
        const rowValues = Object.values(row);
        
        // Check if we have actual data (not empty lines)
        if (rowValues.length < 5 || !rowValues[0] || !rowValues[3]) {
          continue; // Skip empty or incomplete rows
        }
        
        // Parse the time entry
        const timeEntry = {
          lastName: rowValues[0],
          firstName: rowValues[1],
          employeeId: rowValues[2] || null,
          date: this.parseDate(rowValues[3]),
          timeIn: rowValues[4] || null,
          timeOut: rowValues[5] || null,
          totalHours: rowValues[6] || '0:00',
          deptCode: rowValues[7] || null,
          inLocation: rowValues[8] || null,
          inPunchMethod: rowValues[9] || null,
          outLocation: rowValues[10] || null,
          outPunchMethod: rowValues[11] || null
        };
        
        // Parse hours from format like "11:51" or ":30" to decimal hours
        if (timeEntry.totalHours) {
          timeEntry.hoursDecimal = this.parseHoursToDecimal(timeEntry.totalHours);
        } else {
          timeEntry.hoursDecimal = 0;
        }

        // Track detected date range from the actual data rows
        if (timeEntry.date) {
          if (!detectedStartDate || new Date(timeEntry.date) < new Date(detectedStartDate)) {
            detectedStartDate = timeEntry.date;
          }
          if (!detectedEndDate || new Date(timeEntry.date) > new Date(detectedEndDate)) {
            detectedEndDate = timeEntry.date;
          }
        }
        
        results.push(timeEntry);
      } catch (error) {
        console.error('Error processing row:', error);
        errors.push({ row: Object.values(row), error: error.message });
      }
    }
    
    // Extract date range from the format "MM/DD/YYYY-MM/DD/YYYY"
    let periodStart = null;
    let periodEnd = null;
    
    if (dateRange) {
      const dates = dateRange.split('-');
      if (dates.length === 2) {
        try {
          periodStart = this.parseDate(dates[0]);
          periodEnd = this.parseDate(dates[1]);
        } catch (error) {
          errors.push({ error: `Invalid date range format: ${dateRange}` });
        }
      }
    }
    
    // Determine final period range using detected dates when headers are missing or incorrect
    const headerRangeIsValid = periodStart && periodEnd && detectedStartDate && detectedEndDate &&
      new Date(detectedStartDate) >= new Date(periodStart) && new Date(detectedEndDate) <= new Date(periodEnd);

    const finalPeriodStart = headerRangeIsValid ? periodStart : (detectedStartDate || periodStart);
    const finalPeriodEnd = headerRangeIsValid ? periodEnd : (detectedEndDate || periodEnd);

    if (!headerRangeIsValid) {
      console.log('Using detected date range for period:', finalPeriodStart, finalPeriodEnd);
    }

    // Save the timesheet data to database
    if (results.length > 0) {
      try {
        const periodId = await Timesheet.saveTimeEntries(results, {
          reportTitle,
          periodStart: finalPeriodStart,
          periodEnd: finalPeriodEnd,
          userId: req.user.id
        });
        
        return res.status(200).json(formatSuccess('Timesheet data uploaded and processed successfully', {
          periodId,
          reportTitle,
          periodStart: finalPeriodStart,
          periodEnd: finalPeriodEnd,
          totalEntries: results.length,
          errors: errors.length > 0 ? errors : null
        }));
      } catch (dbError) {
        console.error('Database error:', dbError);
        
        // Check if this is a duplicate period error
        if (dbError.message && dbError.message.includes('duplicate') || 
            dbError.message && dbError.message.includes('already been uploaded')) {
          return res.status(409).json(formatError({
            message: 'This pay period already exists in the system. Each period can only be uploaded once.',
            details: dbError.message
          }));
        }
        
        // Handle unique constraint violation from MySQL
        if (dbError.code === 'ER_DUP_ENTRY') {
          return res.status(409).json(formatError({
            message: 'This pay period already exists in the system. Each period can only be uploaded once.',
            details: 'Duplicate period detected'
          }));
        }
        
        return res.status(500).json(formatError({
          message: 'Error saving timesheet data to the database',
          details: dbError.message
        }));
      }
    } else {
      return res.status(400).json(formatError({
        message: 'No valid timesheet entries found in the CSV file',
        errors
      }));
    }
  } catch (error) {
    console.error('CSV upload error:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * Parse date strings in various formats
 * @param {string} dateString - Date string to parse
 * @returns {string} - ISO date string
 */
exports.parseDate = function(dateString) {
  if (!dateString) {
    throw new Error('Date string is empty');
  }

  const trimmed = String(dateString).trim();
  const dateMatch = trimmed.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
  const normalizedInput = dateMatch ? dateMatch[0] : trimmed;
  
  // Try to parse the date (handle different formats)
  let date;
  
  // Try M/D/YYYY format
  try {
    date = parse(normalizedInput, 'MM/dd/yyyy', new Date());
    if (isNaN(date.getTime())) {
      date = parse(normalizedInput, 'M/d/yyyy', new Date());
      if (isNaN(date.getTime())) throw new Error('Invalid date');
    }
    return date.toISOString().split('T')[0];
  } catch (e) {
    // Try other formats if needed
    try {
      date = new Date(normalizedInput);
      if (isNaN(date.getTime())) throw new Error('Invalid date');
      return date.toISOString().split('T')[0];
    } catch (e2) {
      throw new Error(`Could not parse date: ${dateString}`);
    }
  }
};

/**
 * Parse hours from format like "11:51" or ":30" to decimal hours
 * @param {string} hoursString - Hours string to parse (HH:MM format or :MM format)
 * @returns {number} - Hours in decimal
 */
exports.parseHoursToDecimal = function(hoursString) {
  if (!hoursString || hoursString === '0:00') {
    return 0;
  }
  
  // Handle the case where the hours string starts with a colon (like ":30")
  if (hoursString.startsWith(':')) {
    const minutes = parseInt(hoursString.substring(1), 10);
    return minutes / 60;
  }
  
  // Handle the normal case (like "11:51")
  const parts = hoursString.split(':');
  if (parts.length !== 2) {
    return 0;
  }
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  // Convert to decimal hours
  return hours + (minutes / 60);
};

/**
 * @desc    Get all timesheet periods
 * @route   GET /api/payroll/timesheet-periods
 * @access  Private/Admin
 */
exports.getTimesheetPeriods = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    const periods = await Timesheet.getAllPeriods({ limit, offset });
    
    return res.status(200).json(formatSuccess('Timesheet periods retrieved successfully', periods));
  } catch (error) {
    console.error('Error retrieving timesheet periods:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get timesheet period by id
 * @route   GET /api/payroll/timesheet-periods/:id
 * @access  Private/Admin
 */
exports.getTimesheetPeriod = async (req, res) => {
  try {
    const { id } = req.params;
    
    const period = await Timesheet.getPeriodById(id);
    
    if (!period) {
      return res.status(404).json(formatError({
        message: 'Timesheet period not found'
      }));
    }
    
    const entries = await Timesheet.getEntriesByPeriodId(id);
    
    return res.status(200).json(formatSuccess('Timesheet period retrieved successfully', {
      period,
      entries
    }));
  } catch (error) {
    console.error('Error retrieving timesheet period:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Calculate payroll for a period
 * @route   POST /api/payroll/calculate
 * @access  Private/Admin
 */
exports.calculatePayroll = async (req, res) => {
  try {
    const { periodId, payDate, periodStart, periodEnd } = req.body;
    
    if (!periodId) {
      return res.status(400).json(formatError({
        message: 'Period ID is required'
      }));
    }
    
    // Build options object with optional custom period dates
    const options = {
      payDate: payDate ? new Date(payDate) : new Date()
    };
    
    // Add custom period dates if provided
    if (periodStart) {
      options.periodStart = new Date(periodStart);
    }
    
    if (periodEnd) {
      options.periodEnd = new Date(periodEnd);
    }
    
    // Call the Payroll model to perform calculations
    const result = await Payroll.calculateForPeriod(
      periodId,
      options,
      req.user.id
    );
    
    return res.status(200).json(formatSuccess('Payroll calculated successfully', result));
  } catch (error) {
    console.error('Error calculating payroll:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update payroll run status (finalize)
 * @route   PATCH /api/payroll/reports/:id/status
 * @access  Private/Admin
 */
exports.updatePayrollStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json(formatError({
        message: 'Status is required'
      }));
    }

    const payrollRunId = parseInt(id, 10);

    if (Number.isNaN(payrollRunId)) {
      return res.status(400).json(formatError({
        message: 'Payroll run ID must be a valid number'
      }));
    }

    const updatedRun = await Payroll.updatePayrollStatus(payrollRunId, status);

    return res.status(200).json(formatSuccess('Payroll status updated successfully', updatedRun));
  } catch (error) {
    console.error('Error updating payroll status:', error);

    const message = error.message || '';

    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json(formatError(error));
    }

    if (
      message.toLowerCase().includes('invalid') ||
      message.toLowerCase().includes('finalized') ||
      message.toLowerCase().includes('completed')
    ) {
      return res.status(400).json(formatError(error));
    }

    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get payroll reports
 * @route   GET /api/payroll/reports
 * @access  Private/Admin
 */
exports.getPayrollReports = async (req, res) => {
  try {
    const { limit = 10, page = 1 } = req.query;
    const offset = (page - 1) * limit;
    
    const reports = await Payroll.getAllPayrollRuns({ limit, offset });
    
    return res.status(200).json(formatSuccess('Payroll reports retrieved successfully', reports));
  } catch (error) {
    console.error('Error retrieving payroll reports:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get a specific payroll report
 * @route   GET /api/payroll/reports/:id
 * @access  Private/Admin
 */
exports.getPayrollReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await Payroll.getPayrollRunById(id);
    
    if (!report) {
      return res.status(404).json(formatError({
        message: 'Payroll report not found'
      }));
    }
    
    // Add email information for each employee in the report
    if (report.items && report.items.length > 0) {
      // Get all employee IDs from the payroll items
      const employeeIds = report.items
        .filter(item => item.employee_id)
        .map(item => item.employee_id);
      
      if (employeeIds.length > 0) {
        // Get email information from the users table
        const [employees] = await db.query(`
          SELECT e.id, u.email
          FROM employees e
          LEFT JOIN users u ON e.user_id = u.id
          WHERE e.id IN (${employeeIds.map(() => '?').join(',')})
        `, employeeIds);
        
        // Create a map of employee_id to email
        const emailMap = {};
        for (const employee of employees) {
          emailMap[employee.id] = employee.email;
        }
        
        // Add email to each payroll item
        for (const item of report.items) {
          if (item.employee_id && emailMap[item.employee_id]) {
            item.email = emailMap[item.employee_id];
          }
        }
      }
    }
    
    return res.status(200).json(formatSuccess('Payroll report retrieved successfully', report));
  } catch (error) {
    console.error('Error retrieving payroll report:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Download paystub PDF for a specific employee
 * @route   GET /api/payroll/paystub/:payrollRunId/:employeeId
 * @access  Private
 */
exports.downloadPaystub = async (req, res) => {
  try {
    const { payrollRunId, employeeId } = req.params;
    
    // Get payroll run details
    const payrollRun = await Payroll.getPayrollRunById(payrollRunId);
    
    if (!payrollRun) {
      return res.status(404).json(formatError({
        message: 'Payroll run not found'
      }));
    }
    
    // Find the specific employee's payroll item
    const payrollItem = payrollRun.items.find(item =>
      (item.employee_id && item.employee_id.toString() === employeeId) ||
      (item.id && item.id.toString() === employeeId)
    );
    
    if (!payrollItem) {
      return res.status(404).json(formatError('Employee payroll data not found'));
    }

    // Ensure gross pay is properly formatted
    if (payrollItem.gross_pay) {
      payrollItem.gross_pay = parseFloat(payrollItem.gross_pay).toFixed(2);
    }

    // Loan functionality removed

    // Prepare period data for PDF
    // Use custom dates if they were used during calculation, otherwise use default period dates
    const actualStartDate = payrollRun.custom_period_start || payrollRun.period_start;
    const actualEndDate = payrollRun.custom_period_end || payrollRun.period_end;
    
    const periodData = {
      periodStart: actualStartDate ? new Date(actualStartDate).toLocaleDateString() : 'N/A',
      periodEnd: actualEndDate ? new Date(actualEndDate).toLocaleDateString() : 'N/A',
      payDate: payrollRun.pay_date ? new Date(payrollRun.pay_date).toLocaleDateString() : new Date().toLocaleDateString(),
      // Include flag to indicate if custom dates were used
      usedCustomDates: !!(payrollRun.custom_period_start || payrollRun.custom_period_end)
    };
    
    // Fetch employee details from database
    let employeeDetails = null;
    if (payrollItem.employee_id) {
      try {
        const [rows] = await db.query(
          'SELECT * FROM employees WHERE id = ?',
          [payrollItem.employee_id]
        );
        
        if (rows && rows.length > 0) {
          employeeDetails = rows[0];
          console.log(`Found employee details for ID ${payrollItem.employee_id}:`, employeeDetails);
        }
      } catch (err) {
        console.error('Error fetching employee details:', err);
      }
    }
    
    // Get loan details if there's a loan deduction
    let loanDetails = [];
    if (payrollItem.loan_deduction && parseFloat(payrollItem.loan_deduction) > 0) {
      // Get loan payment details for this payroll item
      const [loanPayments] = await db.query(`
        SELECT 
          lp.*, 
          el.expected_end_date,
          el.loan_type,
          el.third_party_name,
          el.third_party_reference
        FROM 
          loan_payments lp
        JOIN 
          employee_loans el ON lp.loan_id = el.id
        WHERE 
          lp.payroll_item_id = ?
      `, [payrollItem.id]);
      
      if (loanPayments && loanPayments.length > 0) {
        loanDetails = loanPayments.map(payment => ({
          loanId: payment.loan_id,
          paymentAmount: payment.payment_amount,
          remainingBalance: payment.remaining_balance,
          expectedEndDate: payment.expected_end_date ? new Date(payment.expected_end_date).toLocaleDateString() : null,
          loan_type: payment.loan_type || 'internal',
          third_party_name: payment.third_party_name,
          third_party_reference: payment.third_party_reference
        }));
      }
    }
    
    // Get payroll settings for the PDF
    const [payrollSettings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
    
    // Generate PDF with employee details, loan information, and payroll settings
    const pdfBuffer = await generatePaystubPDF(payrollItem, periodData, { 
      employeeDetails,
      loanDetails,
      payrollSettings: payrollSettings[0] || {}
    });
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    const employeeName = payrollItem.employeeName || payrollItem.employee_name || 'Unknown';
    res.setHeader('Content-Disposition', `attachment; filename=paystub-${employeeName.replace(/\s+/g, '-')}-${payrollRunId}.pdf`);
    
    // Send the PDF
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating paystub PDF:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get payroll settings
 * @route   GET /api/payroll/settings
 * @access  Private/Admin
 */
exports.getPayrollSettings = async (req, res) => {
  try {
    const [settings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
    
    if (settings.length === 0) {
      return res.status(404).json(formatError({
        message: 'Payroll settings not found'
      }));
    }
    
    return res.status(200).json(formatSuccess('Payroll settings retrieved successfully', settings[0]));
  } catch (error) {
    console.error('Error retrieving payroll settings:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update payroll settings
 * @route   PUT /api/payroll/settings
 * @access  Private/Admin
 */
exports.updatePayrollSettings = async (req, res) => {
  try {
    const {
      socialSecurityEmployeeRate,
      socialSecurityEmployerRate,
      socialSecurityMaxInsurable,
      medicalBenefitsEmployeeRate,
      medicalBenefitsEmployerRate,
      medicalBenefitsEmployeeSeniorRate,
      educationLevyRate,
      educationLevyHighRate,
      educationLevyThreshold,
      educationLevyExemption,
      retirementAge,
      medicalBenefitsSeniorAge,
      medicalBenefitsMaxAge,
      // New private duty nurse rates
      privateDutyNurseDayWeekday,
      privateDutyNurseNightAll,
      privateDutyNurseDayWeekend,
      privateDutyNurseDayStart,
      privateDutyNurseDayEnd,
      // Government report numbering settings
      ssReportNumberBase,
      ssReportNumberCurrent,
      ssReportAutoIncrement,
      mbReportNumberBase,
      mbReportNumberCurrent,
      mbReportAutoIncrement,
      elReportNumberBase,
      elReportNumberCurrent,
      elReportAutoIncrement
    } = req.body;
    
    const [result] = await db.query(
      `UPDATE payroll_settings SET
        social_security_employee_rate = COALESCE(?, social_security_employee_rate),
        social_security_employer_rate = COALESCE(?, social_security_employer_rate),
        social_security_max_insurable = COALESCE(?, social_security_max_insurable),
        medical_benefits_employee_rate = COALESCE(?, medical_benefits_employee_rate),
        medical_benefits_employer_rate = COALESCE(?, medical_benefits_employer_rate),
        medical_benefits_employee_senior_rate = COALESCE(?, medical_benefits_employee_senior_rate),
        education_levy_rate = COALESCE(?, education_levy_rate),
        education_levy_high_rate = COALESCE(?, education_levy_high_rate),
        education_levy_threshold = COALESCE(?, education_levy_threshold),
        education_levy_exemption = COALESCE(?, education_levy_exemption),
        retirement_age = COALESCE(?, retirement_age),
        medical_benefits_senior_age = COALESCE(?, medical_benefits_senior_age),
        medical_benefits_max_age = COALESCE(?, medical_benefits_max_age),
        private_duty_nurse_day_weekday = COALESCE(?, private_duty_nurse_day_weekday),
        private_duty_nurse_night_all = COALESCE(?, private_duty_nurse_night_all),
        private_duty_nurse_day_weekend = COALESCE(?, private_duty_nurse_day_weekend),
        private_duty_nurse_day_start = COALESCE(?, private_duty_nurse_day_start),
        private_duty_nurse_day_end = COALESCE(?, private_duty_nurse_day_end),
        ss_report_number_base = COALESCE(?, ss_report_number_base),
        ss_report_number_current = COALESCE(?, ss_report_number_current),
        ss_report_auto_increment = COALESCE(?, ss_report_auto_increment),
        mb_report_number_base = COALESCE(?, mb_report_number_base),
        mb_report_number_current = COALESCE(?, mb_report_number_current),
        mb_report_auto_increment = COALESCE(?, mb_report_auto_increment),
        el_report_number_base = COALESCE(?, el_report_number_base),
        el_report_number_current = COALESCE(?, el_report_number_current),
        el_report_auto_increment = COALESCE(?, el_report_auto_increment),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        socialSecurityEmployeeRate,
        socialSecurityEmployerRate,
        socialSecurityMaxInsurable,
        medicalBenefitsEmployeeRate,
        medicalBenefitsEmployerRate,
        medicalBenefitsEmployeeSeniorRate,
        educationLevyRate,
        educationLevyHighRate,
        educationLevyThreshold,
        educationLevyExemption,
        retirementAge,
        medicalBenefitsSeniorAge,
        medicalBenefitsMaxAge,
        privateDutyNurseDayWeekday,
        privateDutyNurseNightAll,
        privateDutyNurseDayWeekend,
        privateDutyNurseDayStart,
        privateDutyNurseDayEnd,
        ssReportNumberBase,
        ssReportNumberCurrent,
        ssReportAutoIncrement,
        mbReportNumberBase,
        mbReportNumberCurrent,
        mbReportAutoIncrement,
        elReportNumberBase,
        elReportNumberCurrent,
        elReportAutoIncrement
      ]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json(formatError({
        message: 'Payroll settings not found'
      }));
    }
    
    // Get the updated settings
    const [settings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
    
    return res.status(200).json(formatSuccess('Payroll settings updated successfully', settings[0]));
  } catch (error) {
    console.error('Error updating payroll settings:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Email paystubs to employees
 * @route   POST /api/payroll/email-paystubs
 * @access  Private/Admin
 */
/**
 * @desc    Get management-focused deductions report
 * @route   GET /api/payroll/deductions-report
 * @access  Private/Admin
 */
exports.getDeductionsReport = async (req, res) => {
  try {
    const {
      filterType = 'all',
      startDate,
      endDate,
      departmentId,
      includeInactive = false,
      format = 'csv'
    } = req.query;

    // Validate filter parameters
    if (filterType === 'range' && (!startDate || !endDate)) {
      return res.status(400).json(formatError({
        message: 'Start date and end date are required for range filter'
      }));
    }

    if (filterType === 'dept' && !departmentId) {
      return res.status(400).json(formatError({
        message: 'Department ID is required for department filter'
      }));
    }

    // Get the report data from the Payroll model
    const reportData = await Payroll.generateDeductionsReport({
      filterType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      departmentId: departmentId ? parseInt(departmentId, 10) : undefined,
      includeInactive: includeInactive === 'true'
    });

    // If CSV format is requested, convert the data to CSV
    if (format === 'csv') {
      // Create CSV content
      let csvContent = 'Employee ID,Name,Gross Pay,Net Pay,SS (EE),SS (ER),MB (EE),MB (ER),EL (EE),EL (ER)\n';
      
      // Add data rows
      reportData.rows.forEach(row => {
        csvContent += `${row.employee_id},${row.name},${row.gross_pay},${row.net_pay},${row.ss_employee},${row.ss_employer},${row.mb_employee},${row.mb_employer},${row.el_employee},${row.el_employer}\n`;
      });
      
      // Add totals row
      csvContent += `,,${reportData.totals.gross_pay},${reportData.totals.net_pay},${reportData.totals.ss_employee},${reportData.totals.ss_employer},${reportData.totals.mb_employee},${reportData.totals.mb_employer},${reportData.totals.el_employee},${reportData.totals.el_employer}\n`;
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=deductions-report-${new Date().toISOString().split('T')[0]}.csv`);
      
      // Send CSV response
      return res.send(csvContent);
    }

    // Return JSON response by default
    return res.status(200).json(formatSuccess('Deductions report generated successfully', reportData));
  } catch (error) {
    console.error('Error generating deductions report:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get bank-focused ACH report for payroll direct deposits
 * @route   GET /api/payroll/ach-report/:id
 * @access  Private/Admin
 */
exports.getACHReport = async (req, res) => {
  try {
    const { id: payrollRunId } = req.params;
    const { format = 'csv' } = req.query;

    if (!payrollRunId) {
      return res.status(400).json(formatError({
        message: 'Payroll run ID is required'
      }));
    }

    // Get the ACH report data from the Payroll model
    const achReportData = await Payroll.generateACHReport(payrollRunId);
    
    // Get third-party payments data for this payroll run
    const EmployeeLoan = require('../models/EmployeeLoan');
    const thirdPartyPayments = await EmployeeLoan.getThirdPartyPaymentsForPayrollRun(payrollRunId);

    // If CSV format is requested, convert the data to CSV format
    if (format === 'csv') {
      // Create CSV content according to the specified format
      // [A: Routing Number] [B: Account Number] [C: Ck/Sv] [D: Name] [E: City, Country] [F: Amount] [G: Credit]
      // Note: Headers are removed as per client's request
      let csvContent = '';
      
      // Add data rows only for entries with valid banking information
      achReportData.items.forEach(item => {
        if (item.has_banking_info) {
          // Use the institute field which is formatted as "City, Country"
          csvContent += `${item.routing_number},${item.account_number},${item.account_type},${item.employee_name},${item.institute},${item.amount},Cr\n`;
        }
      });
      
      // Add third-party payments to the end of the CSV file using same format
      if (thirdPartyPayments && thirdPartyPayments.length > 0) {
        thirdPartyPayments.forEach(payment => {
          // Check if the payment has the necessary fields
          if (payment.third_party_routing_number && payment.third_party_account_number) {
            // Format the data the same way as direct deposits
            const name = `${payment.third_party_name} (${payment.first_name} ${payment.last_name})`;
            const reference = payment.third_party_reference ? ` - ${payment.third_party_reference}` : '';
            const institute = `Third-party payment${reference}`;
            const amount = parseFloat(payment.payment_amount).toFixed(2);
            
            csvContent += `${payment.third_party_routing_number},${payment.third_party_account_number},Ck,${name},${institute},${amount},Cr\n`;
          }
        });
      }
      
      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=ach-report-${achReportData.payrollRun?.period_id || payrollRunId}-${new Date().toISOString().split('T')[0]}.csv`);
      
      // Send CSV response
      return res.send(csvContent);
    }

    // Process the data to mask sensitive account information in JSON response
    // Mask sensitive data in third-party payments
    const maskedThirdPartyPayments = thirdPartyPayments.map(payment => {
      return {
        ...payment,
        third_party_account_number: payment.third_party_account_number ? 
          `XXXX${payment.third_party_account_number.slice(-4)}` : null,
        third_party_routing_number: payment.third_party_routing_number ? 
          `XXXX${payment.third_party_routing_number.slice(-4)}` : null
      };
    });

    const maskedResponseData = {
      payrollRun: achReportData.payrollRun,
      summary: {
        ...achReportData.summary,
        third_party_payment_total: thirdPartyPayments.reduce((sum, payment) => 
          sum + parseFloat(payment.payment_amount || 0), 0).toFixed(2),
        third_party_payment_count: thirdPartyPayments.length
      },
      items: achReportData.items.map(item => {
        // Mask account numbers in the response for security
        if (item.has_banking_info) {
          return {
            ...item,
            // Mask account number and routing numbers (show only last 4 digits)
            account_number: `XXXX${item.account_number.slice(-4)}`,
            routing_number: `XXXX${item.routing_number.slice(-4)}`,
          };
        }
        return item;
      }),
      thirdPartyPayments: maskedThirdPartyPayments
    };

    // Return JSON response by default
    return res.status(200).json(formatSuccess('ACH report generated successfully', maskedResponseData));
  } catch (error) {
    console.error('Error generating ACH report:', error);
    return res.status(500).json(formatError(error));
  }
};

exports.emailPaystubs = async (req, res) => {
  try {
    const { payrollRunId, sendToAll = false, employeeIds = [] } = req.body;
    
    if (!payrollRunId) {
      return res.status(400).json(formatError({
        message: 'Payroll run ID is required'
      }));
    }
    
    // Get the payroll run data
    const payrollRun = await Payroll.getPayrollRunById(payrollRunId);
    
    if (!payrollRun) {
      return res.status(404).json(formatError({
        message: 'Payroll run not found'
      }));
    }
    
    // Filter payroll items if not sending to all
    const payrollItems = sendToAll 
      ? payrollRun.items 
      : payrollRun.items.filter(item => 
          employeeIds.includes(item.employee_id) || 
          employeeIds.includes(item.employee_id?.toString())
        );
    
    if (payrollItems.length === 0) {
      return res.status(400).json(formatError({
        message: 'No employees to send paystubs to'
      }));
    }
    
    // Get employee email addresses
    const employeeEmails = [];
    
    for (const item of payrollItems) {
      if (item.employee_id) {
        const [employees] = await db.query(
          `SELECT e.id, e.first_name, e.last_name, u.email, e.employee_type, e.hourly_rate, e.salary_amount, e.standard_hours
           FROM employees e
           LEFT JOIN users u ON e.user_id = u.id
           WHERE e.id = ?`,
          [item.employee_id]
        );
        
        if (employees.length > 0 && employees[0].email) {
          employeeEmails.push({
            id: item.employee_id,
            name: `${employees[0].first_name} ${employees[0].last_name}`,
            email: employees[0].email,
            payrollItem: item,
            employeeDetails: employees[0]
          });
        }
      }
    }
    
    if (employeeEmails.length === 0) {
      return res.status(400).json(formatError({
        message: 'No employees with valid email addresses found'
      }));
    }
    
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT), // 465
      secure: true, // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    
    // Get payroll settings for PDF generation
    const [payrollSettings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
    
    // Prepare period data for PDF
    const periodData = {
      periodStart: payrollRun.period_start ? new Date(payrollRun.period_start).toLocaleDateString() : 'N/A',
      periodEnd: payrollRun.period_end ? new Date(payrollRun.period_end).toLocaleDateString() : 'N/A',
      payDate: payrollRun.pay_date ? new Date(payrollRun.pay_date).toLocaleDateString() : new Date().toLocaleDateString()
    };
    
    // Prepare and send emails
    const emailResults = [];
    const emailTemplate = path.join(__dirname, '../views/paystub-email.ejs');
    
    if (!fs.existsSync(emailTemplate)) {
      // Create a simple email template if it doesn't exist
      const templateDir = path.join(__dirname, '../views');
      
      if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
      }
      
      const defaultTemplate = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Your Paystub</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { width: 80%; margin: 0 auto; }
            .header { background: #f4f4f4; padding: 1em; }
            .content { padding: 1em; }
            .footer { text-align: center; margin-top: 2em; font-size: 0.8em; color: #777; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Paystub</h1>
              <p>Pay Period: <%= periodStart %> to <%= periodEnd %></p>
            </div>
            <div class="content">
              <p>Dear <%= employeeName %>,</p>
              <p>Please find attached your paystub for the current pay period.</p>
              <h2>Payroll Summary</h2>
              <table>
                <tr>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
                <tr>
                  <td>Hours Worked</td>
                  <td><%= hoursWorked %></td>
                </tr>
                <tr>
                  <td>Gross Pay</td>
                  <td>$<%= grossPay.toFixed(2) %></td>
                </tr>
                <tr>
                  <td>Social Security (7%)</td>
                  <td>$<%= socialSecurityEmployee.toFixed(2) %></td>
                </tr>
                <tr>
                  <td>Medical Benefits</td>
                  <td>$<%= medicalBenefitsEmployee.toFixed(2) %></td>
                </tr>
                <tr>
                  <td>Education Levy</td>
                  <td>$<%= educationLevy.toFixed(2) %></td>
                </tr>
                <tr>
                  <td><strong>Net Pay</strong></td>
                  <td><strong>$<%= netPay.toFixed(2) %></strong></td>
                </tr>
              </table>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      fs.writeFileSync(emailTemplate, defaultTemplate);
    }
    
    for (const employee of employeeEmails) {
      try {
        // Generate PDF for attachment
        let loanDetails = [];
        
        // Get loan details if there's a loan deduction
        if (employee.payrollItem.loan_deduction && parseFloat(employee.payrollItem.loan_deduction) > 0) {
          // Get loan payment details for this payroll item
          const [loanPayments] = await db.query(`
            SELECT 
              lp.*, 
              el.expected_end_date,
              el.loan_type,
              el.third_party_name,
              el.third_party_reference
            FROM 
              loan_payments lp
            JOIN 
              employee_loans el ON lp.loan_id = el.id
            WHERE 
              lp.payroll_item_id = ?
          `, [employee.payrollItem.id]);
          
          if (loanPayments && loanPayments.length > 0) {
            loanDetails = loanPayments.map(payment => ({
              loanId: payment.loan_id,
              paymentAmount: payment.payment_amount,
              remainingBalance: payment.remaining_balance,
              expectedEndDate: payment.expected_end_date ? new Date(payment.expected_end_date).toLocaleDateString() : null,
              loan_type: payment.loan_type || 'internal',
              third_party_name: payment.third_party_name,
              third_party_reference: payment.third_party_reference
            }));
          }
        }
        
        // Generate PDF with employee details
        const pdfBuffer = await generatePaystubPDF(employee.payrollItem, periodData, { 
          employeeDetails: employee.employeeDetails,
          loanDetails,
          payrollSettings: payrollSettings[0] || {}
        });
        
        const fileName = `paystub-${employee.name.replace(/\s+/g, '-')}-${payrollRun.period_start}-${payrollRun.period_end}.pdf`;
        
        // Render email template
        const emailContent = await ejs.renderFile(emailTemplate, {
          employeeName: employee.name,
          periodStart: periodData.periodStart,
          periodEnd: periodData.periodEnd,
          payDate: periodData.payDate,
          hoursWorked: employee.payrollItem.hours_worked || 0,
          grossPay: parseFloat(employee.payrollItem.gross_pay) || 0,
          socialSecurityEmployee: parseFloat(employee.payrollItem.social_security_employee) || 0,
          medicalBenefitsEmployee: parseFloat(employee.payrollItem.medical_benefits_employee) || 0,
          educationLevy: parseFloat(employee.payrollItem.education_levy) || 0,
          netPay: parseFloat(employee.payrollItem.net_pay) || 0,
          ytdGrossPay: parseFloat(employee.payrollItem.ytd_gross_pay) || 0,
          ytdSocialSecurityEmployee: parseFloat(employee.payrollItem.ytd_social_security_employee) || 0,
          ytdMedicalBenefitsEmployee: parseFloat(employee.payrollItem.ytd_medical_benefits_employee) || 0,
          ytdEducationLevy: parseFloat(employee.payrollItem.ytd_education_levy) || 0,
          ytdNetPay: parseFloat(employee.payrollItem.ytd_net_pay) || 0
        });
        
        // Send email with PDF attachment
        const info = await transporter.sendMail({
          from: `"MSA Payroll System" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
          to: employee.email,
          subject: `Your Paystub for ${periodData.periodStart} to ${periodData.periodEnd}`,
          html: emailContent,
          attachments: [
            {
              filename: fileName,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });
        
        emailResults.push({
          employeeId: employee.id,
          name: employee.name,
          email: employee.email,
          status: 'sent',
          messageId: info.messageId
        });
      } catch (error) {
        console.error(`Error sending email to ${employee.email}:`, error);
        emailResults.push({
          employeeId: employee.id,
          name: employee.name,
          email: employee.email,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return res.status(200).json(formatSuccess('Paystubs emailed successfully', {
      total: employeeEmails.length,
      sent: emailResults.filter(r => r.status === 'sent').length,
      failed: emailResults.filter(r => r.status === 'failed').length,
      results: emailResults
    }));
  } catch (error) {
    console.error('Error emailing paystubs:', error);
    return res.status(500).json(formatError(error));
  }
};
