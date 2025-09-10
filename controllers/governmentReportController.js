/**
 * Government Reports Controller
 * Handles API endpoints for generating government reports (Social Security, Medical Benefits, Education Levy)
 */

const db = require('../config/db');
const { formatSuccess, formatError } = require('../utils/helpers');
const govReportsPdf = require('../utils/govReportsPdf');

/**
 * @desc    Generate a government report (PDF or JSON)
 * @route   GET /api/reports/government/:type
 * @access  Private/Admin
 */
exports.generateGovernmentReport = async (req, res) => {
  try {
    // Get report type from URL parameter
    const { type } = req.params;
    
    // Validate report type
    const validTypes = ['ss', 'mb', 'el'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type. Must be one of: ss, mb, el'
      });
    }
    
    // Get query parameters
    const format = req.query.format?.toLowerCase() || 'pdf';
    const incrementNumber = req.query.incrementNumber === 'true';
    
    // Get payroll run ID from query parameters
    const { payrollRunId } = req.query;
    
    if (!payrollRunId) {
      return res.status(400).json({
        success: false,
        message: 'Payroll run ID is required'
      });
    }
    
    // Validate payroll run ID is a number
    const parsedPayrollRunId = parseInt(payrollRunId);
    if (isNaN(parsedPayrollRunId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payroll run ID. Must be a number'
      });
    }
    
    // Check if the payroll run exists and has the required status
    const [payrollRun] = await db.query(`
      SELECT pr.id, pr.pay_date, tp.period_start as pay_period_start, tp.period_end as pay_period_end, pr.status,
             COUNT(pi.id) as item_count
      FROM payroll_runs pr
      LEFT JOIN timesheet_periods tp ON pr.period_id = tp.id
      LEFT JOIN payroll_items pi ON pr.id = pi.payroll_run_id
      WHERE pr.id = ?
      AND pr.status IN ('completed', 'completed_with_errors', 'finalized')
      GROUP BY pr.id
    `, [parsedPayrollRunId]);
    
    if (payrollRun.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payroll run not found or not in completed status'
      });
    }
    
    if (payrollRun[0].item_count === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll items found for this payroll run'
      });
    }
    
    const payrollRunData = payrollRun[0];
    
    // Generate the report based on the requested format
    if (format === 'json') {
      // Return JSON data
      const reportData = await govReportsPdf.generateReportData(type, parsedPayrollRunId);
      return res.status(200).json(formatSuccess('Report generated successfully', reportData));
    } else if (format === 'pdf') {
      // Generate PDF based on report type
      let pdfBuffer;
      let filename;
      
      const reportOptions = {
        payrollRunId: parsedPayrollRunId,
        payrollRunData: payrollRunData,
        autoIncrement: incrementNumber
      };
      
      // Generate the appropriate PDF report
      switch (type) {
        case 'ss':
          pdfBuffer = await govReportsPdf.generateSocialSecurityPDF(reportOptions);
          filename = `social-security-report-payroll-${parsedPayrollRunId}-${payrollRunData.pay_date.toISOString().split('T')[0]}.pdf`;
          break;
          
        case 'mb':
          pdfBuffer = await govReportsPdf.generateMedicalBenefitsPDF(reportOptions);
          filename = `medical-benefits-report-payroll-${parsedPayrollRunId}-${payrollRunData.pay_date.toISOString().split('T')[0]}.pdf`;
          break;
          
        case 'el':
          pdfBuffer = await govReportsPdf.generateEducationLevyPDF(reportOptions);
          filename = `education-levy-report-payroll-${parsedPayrollRunId}-${payrollRunData.pay_date.toISOString().split('T')[0]}.pdf`;
          break;
      }
      
      // Set response headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      
      // Send the PDF file
      return res.end(pdfBuffer);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid format. Must be one of: pdf, json'
      });
    }
  } catch (error) {
    console.error('Error generating government report:', error);
    
    // Check for specific error types
    if (error.message && error.message.includes('report number conflict')) {
      return res.status(409).json(formatError('Report number conflict. Please try again.'));
    }
    
    return res.status(500).json(formatError('An error occurred while generating the report'));
  }
};

/**
 * @desc    Get report number settings
 * @route   GET /api/reports/government/settings
 * @access  Private/Admin
 */
exports.getReportSettings = async (req, res) => {
  try {
    const [settings] = await db.query(`
      SELECT 
        ss_report_number_base, ss_report_number_current, ss_report_auto_increment,
        mb_report_number_base, mb_report_number_current, mb_report_auto_increment,
        el_report_number_base, el_report_number_current, el_report_auto_increment
      FROM payroll_settings LIMIT 1
    `);
    
    if (settings.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payroll settings not found'
      });
    }
    
    res.status(200).json(formatSuccess('Report settings retrieved successfully', settings[0]));
  } catch (error) {
    console.error('Error retrieving report settings:', error);
    res.status(500).json(formatError('An error occurred while retrieving report settings'));
  }
};

/**
 * @desc    Update report number settings
 * @route   PUT /api/reports/government/settings
 * @access  Private/Admin
 */
exports.updateReportSettings = async (req, res) => {
  try {
    const {
      ss_report_number_base, ss_report_number_current, ss_report_auto_increment,
      mb_report_number_base, mb_report_number_current, mb_report_auto_increment,
      el_report_number_base, el_report_number_current, el_report_auto_increment
    } = req.body;
    
    // Check if settings exist
    const [settingsExist] = await db.query('SELECT id FROM payroll_settings LIMIT 1');
    
    if (settingsExist.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payroll settings not found'
      });
    }
    
    // Update settings
    await db.query(`
      UPDATE payroll_settings SET
        ss_report_number_base = ?,
        ss_report_number_current = ?,
        ss_report_auto_increment = ?,
        mb_report_number_base = ?,
        mb_report_number_current = ?,
        mb_report_auto_increment = ?,
        el_report_number_base = ?,
        el_report_number_current = ?,
        el_report_auto_increment = ?
      WHERE id = ?
    `, [
      ss_report_number_base || 'SS-',
      ss_report_number_current || 1000,
      ss_report_auto_increment !== undefined ? ss_report_auto_increment : true,
      mb_report_number_base || 'MB-',
      mb_report_number_current || 1000,
      mb_report_auto_increment !== undefined ? mb_report_auto_increment : true,
      el_report_number_base || 'EL-',
      el_report_number_current || 1000,
      el_report_auto_increment !== undefined ? el_report_auto_increment : true,
      settingsExist[0].id
    ]);
    
    // Get updated settings
    const [updatedSettings] = await db.query(`
      SELECT 
        ss_report_number_base, ss_report_number_current, ss_report_auto_increment,
        mb_report_number_base, mb_report_number_current, mb_report_auto_increment,
        el_report_number_base, el_report_number_current, el_report_auto_increment
      FROM payroll_settings LIMIT 1
    `);
    
    res.status(200).json(formatSuccess('Report settings updated successfully', updatedSettings[0]));
  } catch (error) {
    console.error('Error updating report settings:', error);
    res.status(500).json(formatError('An error occurred while updating report settings'));
  }
};

/**
 * @desc    Validate SSN format
 * @route   POST /api/reports/government/validate-ssn
 * @access  Private/Admin
 */
exports.validateSSN = async (req, res) => {
  try {
    const { ssn } = req.body;
    
    if (!ssn) {
      return res.status(400).json({
        success: false,
        message: 'SSN is required'
      });
    }
    
    const validationResult = govReportsPdf.validateSSN(ssn);
    
    res.status(200).json(formatSuccess('SSN validation completed', validationResult));
  } catch (error) {
    console.error('Error validating SSN:', error);
    res.status(500).json(formatError('An error occurred while validating SSN'));
  }
};
