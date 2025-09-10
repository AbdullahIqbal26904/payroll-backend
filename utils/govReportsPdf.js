/**
 * Government Reports PDF Generator
 * Generates official PDF reports for Social Security, Medical Benefits, and Education Levy
 * for submission to government agencies.
 */

const PDFDocument = require('pdfkit');
const db = require('../config/db');
const Payroll = require('../models/Payroll');

/**
 * Format monetary values consistently with 2 decimal places
 * @param {number} value - Monetary value to format
 * @returns {string} Formatted string with 2 decimal places
 */
const formatMoney = (value) => {
  return parseFloat(value || 0).toFixed(2);
};

/**
 * Validate and format Social Security Numbers
 * @param {string} ssn - Social Security Number
 * @returns {object} Validation results with formatted SSN and validity flag
 */
const validateSSN = (ssn) => {
  if (!ssn || ssn.trim() === '') {
    return { valid: false, formatted: 'N/A', original: null };
  }
  
  // Clean up the input (trim whitespace)
  const cleanSsn = ssn.trim();
  
  // Check for numeric format (at least 6 digits)
  const numericRegex = /^[0-9]{6,}$/;
  
  // Check for country-coded format (e.g., AB-123456)
  const countryCodedRegex = /^([A-Z]{2,3})-[0-9]{6,}$/;
  
  if (numericRegex.test(cleanSsn)) {
    return { valid: true, formatted: cleanSsn, original: cleanSsn };
  } else if (countryCodedRegex.test(cleanSsn)) {
    return { valid: true, formatted: cleanSsn, original: cleanSsn };
  }
  
  // If the input is not empty but doesn't match our patterns, still return it
  // This ensures values are always displayed even if they don't match expected formats
  return { valid: false, formatted: cleanSsn, original: cleanSsn };
};

/**
 * Map gender/sex values to standardized format for reports
 * @param {string} gender - Gender value from database
 * @returns {string} Standardized gender code (M/F/U)
 */
const formatGender = (gender) => {
  if (!gender) return 'U';
  const g = gender.trim().toLowerCase();
  
  if (g === 'male' || g === 'm') return 'M';
  if (g === 'female' || g === 'f') return 'F';
  return 'U';
};

/**
 * Get settings for reports including rates and report numbering
 * @returns {Promise<Object>} Settings for report generation
 */
const getReportSettings = async () => {
  const [settings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
  if (settings.length === 0) {
    throw new Error('Payroll settings not found');
  }
  return settings[0];
};

/**
 * Update report number in settings after successful generation
 * @param {string} reportType - 'ss', 'mb', or 'el'
 * @param {number} newNumber - New report number
 * @returns {Promise<void>}
 */
const updateReportNumber = async (reportType, newNumber) => {
  const columnName = `${reportType}_report_number_current`;
  await db.query(
    `UPDATE payroll_settings SET ${columnName} = ?`,
    [newNumber]
  );
};

/**
 * Get current report number and format it with base prefix
 * @param {object} settings - Payroll settings
 * @param {string} reportType - 'ss', 'mb', or 'el'
 * @param {number|null} customNumber - Optional custom number to use instead of auto-incrementing
 * @param {boolean} autoIncrement - Whether to increment the report number
 * @returns {Promise<object>} Formatted report number and new number for update
 */
const getReportNumber = async (settings, reportType, customNumber, autoIncrement) => {
  const baseColumn = `${reportType}_report_number_base`;
  const currentColumn = `${reportType}_report_number_current`;
  const autoIncrementColumn = `${reportType}_report_auto_increment`;
  
  const base = settings[baseColumn] || `${reportType.toUpperCase()}-`;
  const current = customNumber || settings[currentColumn] || 1000;
  const shouldAutoIncrement = autoIncrement === undefined ? 
    settings[autoIncrementColumn] : autoIncrement;
  
  const formatted = `${base}${current}`;
  const newNumber = shouldAutoIncrement ? current + 1 : current;
  
  return { formatted, newNumber, shouldUpdate: shouldAutoIncrement };
};

/**
 * Aggregate employee data for reports by payroll run ID
 * @param {number} payrollRunId - Payroll run ID
 * @returns {Promise<Array>} Aggregated employee data
 */
const aggregateEmployeeDataByPayrollRun = async (payrollRunId) => {
  const query = `
    SELECT 
      e.id AS employee_id,
      e.first_name,
      e.last_name,
      e.gender,
      e.date_of_birth,
      e.social_security_no,
      e.medical_benefits_no,
      e.department_id,
      e.payment_frequency,
      d.name AS department_name,
      pi.gross_pay AS total_earnings,
      pi.social_security_employee AS total_ss_employee,
      pi.social_security_employer AS total_ss_employer,
      pi.medical_benefits_employee AS total_mb_employee,
      pi.medical_benefits_employer AS total_mb_employer,
      pi.education_levy AS total_education_levy,
      pr.pay_date,
      tp.period_start AS pay_period_start,
      tp.period_end AS pay_period_end
    FROM 
      payroll_items pi
    JOIN 
      payroll_runs pr ON pi.payroll_run_id = pr.id
    LEFT JOIN
      timesheet_periods tp ON pr.period_id = tp.id
    JOIN 
      employees e ON pi.employee_id = e.id
    LEFT JOIN
      departments d ON e.department_id = d.id
    WHERE 
      pr.id = ?
      AND pr.status IN ('completed', 'completed_with_errors', 'finalized')
    ORDER BY 
      e.last_name, e.first_name
  `;
  
  const [rows] = await db.query(query, [payrollRunId]);
  
  // Calculate age for each employee
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  // Enhance rows with age and validated SSN
  return rows.map(row => ({
    ...row,
    age: calculateAge(row.date_of_birth),
    // Preserve original SSN value and add the validated version
    social_security_no: row.social_security_no || '',
    ssn: validateSSN(row.social_security_no),
    formattedGender: formatGender(row.gender)
  }));
};

/**
 * Aggregate employee data for reports within a date range
 * @param {Date} startDate - Start date for the report
 * @param {Date} endDate - End date for the report
 * @returns {Promise<Array>} Aggregated employee data
 */
const aggregateEmployeeData = async (startDate, endDate) => {
  const query = `
    SELECT 
      e.id AS employee_id,
      e.first_name,
      e.last_name,
      e.gender,
      e.date_of_birth,
      e.social_security_no,
      e.medical_benefits_no,
      e.department_id,
      e.payment_frequency,
      d.name AS department_name,
      SUM(pi.gross_pay) AS total_earnings,
      SUM(pi.social_security_employee) AS total_ss_employee,
      SUM(pi.social_security_employer) AS total_ss_employer,
      SUM(pi.medical_benefits_employee) AS total_mb_employee,
      SUM(pi.medical_benefits_employer) AS total_mb_employer,
      SUM(pi.education_levy) AS total_education_levy
    FROM 
      payroll_items pi
    JOIN 
      payroll_runs pr ON pi.payroll_run_id = pr.id
    JOIN 
      employees e ON pi.employee_id = e.id
    LEFT JOIN
      departments d ON e.department_id = d.id
    WHERE 
      pr.pay_date BETWEEN ? AND ?
      AND pr.status IN ('completed', 'completed_with_errors', 'finalized')
    GROUP BY 
      e.id, e.first_name, e.last_name, e.gender, e.social_security_no, e.medical_benefits_no
    ORDER BY 
      e.last_name, e.first_name
  `;
  
  const [rows] = await db.query(query, [startDate, endDate]);
  
  // Calculate age for each employee
  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return 0;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  // Enhance rows with age and validated SSN
  return rows.map(row => ({
    ...row,
    age: calculateAge(row.date_of_birth),
    // Preserve original SSN value and add the validated version
    social_security_no: row.social_security_no || '',
    ssn: validateSSN(row.social_security_no),
    formattedGender: formatGender(row.gender)
  }));
};

/**
 * Set up common PDF styling elements
 * @param {PDFDocument} doc - PDF document to style
 * @returns {Object} Common styling elements for reuse
 */
const setupPdfStyling = (doc) => {
  // Define colors with a simple, professional look
  const colors = {
    primary: '#000000',
    secondary: '#000000',
    accent: '#000000',
    text: '#000000',
    lightGray: '#f9f9f9',
    border: '#000000'
  };
  
  // Define fonts and styles for reuse
  const fonts = {
    header: { size: 14, font: 'Helvetica-Bold' },
    subheader: { size: 12, font: 'Helvetica-Bold' },
    normal: { size: 10, font: 'Helvetica' },
    small: { size: 9, font: 'Helvetica' },
    bold: { size: 10, font: 'Helvetica-Bold' },
    boldSmall: { size: 9, font: 'Helvetica-Bold' }
  };
  
  return { colors, fonts };
};

/**
 * Draw a table header in the PDF
 * @param {PDFDocument} doc - PDF document
 * @param {Object} options - Options for drawing the header
 * @param {Object} styling - Colors and fonts
 */
const drawTableHeader = (doc, options, styling) => {
  const { x, y, width, headers, columnWidths } = options;
  const { colors, fonts } = styling;
  
  // Draw a simple line above the header
  doc.moveTo(x, y)
     .lineTo(x + width, y)
     .lineWidth(1)
     .stroke(colors.primary);
  
  // Draw header text
  doc.fillColor(colors.primary).fontSize(fonts.boldSmall.size).font(fonts.boldSmall.font);
  
  let currentX = x;
  headers.forEach((header, i) => {
    const colWidth = columnWidths[i];
    const textOptions = {
      width: colWidth,
      align: i === headers.length - 1 ? 'right' : 'left'
    };
    doc.text(header, currentX + 5, y + 6, textOptions);
    currentX += colWidth;
  });
  
  // Draw a line below the header
  doc.moveTo(x, y + 20)
     .lineTo(x + width, y + 20)
     .lineWidth(0.5)
     .stroke(colors.primary);
};

/**
 * Draw a data row in the PDF table
 * @param {PDFDocument} doc - PDF document
 * @param {Object} options - Options for drawing the row
 * @param {Object} styling - Colors and fonts
 * @param {boolean} isAlternate - Whether to use alternate row coloring
 * @param {boolean} isTotal - Whether this is a total row (bold)
 */
const drawTableRow = (doc, options, styling, isAlternate = false, isTotal = false) => {
  const { x, y, width, height, data, columnWidths } = options;
  const { colors, fonts } = styling;
  
  // Draw row text without background color
  doc.fillColor(colors.text)
     .fontSize(fonts.small.size)
     .font(isTotal ? fonts.boldSmall.font : fonts.small.font);
  
  let currentX = x;
  data.forEach((text, i) => {
    const colWidth = columnWidths[i];
    const textOptions = {
      width: colWidth - 10,
      align: i >= data.length - 3 ? 'right' : 'left' // Right-align monetary values
    };
    doc.text(text, currentX + 5, y + 5, textOptions);
    currentX += colWidth;
  });
  
  // Draw a light line below the row if it's the total row
  if (isTotal) {
    doc.moveTo(x, y + height)
       .lineTo(x + width, y + height)
       .lineWidth(1)
       .stroke(colors.primary);
  } else {
    // Draw a very light separator line for regular rows
    doc.moveTo(x, y + height)
       .lineTo(x + width, y + height)
       .lineWidth(0.2)
       .stroke(colors.border);
  }
};

/**
 * Add a footer to the PDF
 * @param {PDFDocument} doc - PDF document
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} styling - Colors and fonts
 */
const addFooter = (doc, x, y, styling) => {
  const { colors, fonts } = styling;
  
  doc.fillColor(colors.text).fontSize(fonts.small.size).font(fonts.normal.font);
  
  // Add generated date
  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  doc.text(`Generated on: ${currentDate}`, x, y, { align: 'center' });
};

/**
 * Format date range for display
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {string} Formatted date range string
 */
const formatDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} to ${end.toLocaleDateString('en-US', options)}`;
};

/**
 * Generate a Social Security Contributions Report PDF
 * @param {Object} options - Report options
 * @param {number} options.payrollRunId - Payroll run ID
 * @param {Object} options.payrollRunData - Payroll run information
 * @param {string} options.reportNumber - Optional custom report number
 * @param {boolean} options.autoIncrement - Whether to auto-increment report number
 * @returns {Promise<Buffer>} PDF document as buffer
 */
const generateSocialSecurityPDF = async ({ payrollRunId, payrollRunData, reportNumber, autoIncrement }) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get settings and employee data
      const settings = await getReportSettings();
      const reportNumberDetails = await getReportNumber(settings, 'ss', reportNumber, autoIncrement);
      const employeeData = await aggregateEmployeeDataByPayrollRun(payrollRunId);
      
      // Create a PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'portrait',
        margin: 30,
        bufferPages: true
      });
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        
        // Update report number if auto-increment is enabled
        if (reportNumberDetails.shouldUpdate) {
          updateReportNumber('ss', reportNumberDetails.newNumber)
            .then(() => resolve(pdfData))
            .catch(error => {
              console.error('Error updating report number:', error);
              resolve(pdfData); // Still return the PDF even if number update fails
            });
        } else {
          resolve(pdfData);
        }
      });
      
      // Set up styling
      const styling = setupPdfStyling(doc);
      const { colors, fonts } = styling;
      
      // Page dimensions
      const pageWidth = doc.page.width - 60;
      const startX = 30;
      const startY = 80; // Start Y position after headers
      
      // Format the date for the report (e.g. Jul-25)
      const payDate = new Date(payrollRunData.pay_date);
      const monthYear = payDate.toLocaleDateString('en-US', { 
        month: 'short', 
        year: '2-digit'
      });
      
      // Add report header with proper formatting
      doc.fontSize(14).font('Helvetica-Bold')
         .text('SOCIAL SECURITY CONTRIBUTIONS', { align: 'left' });
      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES                                 Reg.#${reportNumberDetails.formatted}`, { align: 'left' });

      doc.moveDown(0.2);      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`${monthYear}`, { align: 'left' });
      
      // Define column structure to match the reference
      // No. | Employee | Sex | Earnings for month | Employee 7.00% | Employer 9.00% | 16.00% Contribution
      const columnWidths = [90, 100, 30, 80, 80, 80, 80];
      
      // Calculate SS rates
      const employeeRate = settings.social_security_employee_rate;
      const employerRate = settings.social_security_employer_rate;
      const totalRate = employeeRate + employerRate;
      
      // Create a border for the entire table
      doc.rect(startX, startY, pageWidth, 30).stroke();
      
      // Draw table headers in multi-row format as per reference
      // First row
      doc.fontSize(10).font('Helvetica-Bold');
      
      // Draw vertical lines for first header row
      doc.moveTo(startX, startY).lineTo(startX, startY + 30).stroke(); // Left border
      let currentX = startX;
      columnWidths.forEach(width => {
        currentX += width;
        doc.moveTo(currentX, startY).lineTo(currentX, startY + 30).stroke();
      });
      
      // Draw horizontal line after first header row
      doc.moveTo(startX, startY + 15).lineTo(startX + pageWidth, startY + 15).stroke();
      
      // First row headers
      doc.text('No.', startX + 5, startY + 3, { width: columnWidths[0] });
      doc.text('Employee', startX + columnWidths[0] + 5, startY + 3, { width: columnWidths[1] });
      
      // For "Employees" spanning two columns
      let employeesHeaderX = startX + columnWidths[0] + columnWidths[1] + 5;
      doc.text('Employees', employeesHeaderX, startY + 3, { width: columnWidths[2] + columnWidths[3] });
      
      // Split columns for Employee/Employer
      doc.text('Employee', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               startY + 3, { width: columnWidths[4], align: 'center' });
      doc.text('Employer', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
               startY + 3, { width: columnWidths[5], align: 'center' });
      doc.text('16.00%', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 
               columnWidths[4] + columnWidths[5] + 5, startY + 3, { width: columnWidths[6], align: 'center' });
      
      // Second row headers
      doc.text('', startX + 5, startY + 18, { width: columnWidths[0] }); // No subheader for No.
      doc.text('', startX + columnWidths[0] + 5, startY + 18, { width: columnWidths[1] }); // No subheader for Employee
      doc.text('', startX + columnWidths[0] + columnWidths[1] + 5, startY + 18, { width: columnWidths[2] }); // Sex column
      doc.text('Earnings', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               startY + 18, { width: columnWidths[3], align: 'center' });
      doc.text('for month', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               startY + 24, { width: columnWidths[3], align: 'center' });
      doc.text(`${employeeRate}.00%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               startY + 18, { width: columnWidths[4], align: 'center' });
      doc.text(`${employerRate}.00%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
               startY + 18, { width: columnWidths[5], align: 'center' });
      doc.text('Contribution', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 
               columnWidths[4] + columnWidths[5] + 5, startY + 18, { width: columnWidths[6], align: 'center' });
      
      // Add data rows
      let currentY = startY + 30;
      const rowHeight = 25; // Increased row height for more spacing
      
      // Track totals
      let totalEarnings = 0;
      let totalEmployeeContribution = 0;
      let totalEmployerContribution = 0;
      let totalContribution = 0;
      
      employeeData.forEach(employee => {
        // Skip employees without earnings
        if (parseFloat(employee.total_earnings || 0) === 0) return;
        
        const employeeName = `${employee.first_name} ${employee.last_name}`;
        const earnings = parseFloat(employee.total_earnings || 0);
        const employeeContribution = parseFloat(employee.total_ss_employee || 0);
        const employerContribution = parseFloat(employee.total_ss_employer || 0);
        const totalContrib = employeeContribution + employerContribution;
        
        // Add to totals
        totalEarnings += earnings;
        totalEmployeeContribution += employeeContribution;
        totalEmployerContribution += employerContribution;
        totalContribution += totalContrib;
        
        // Check if we need a new page
        if (currentY > doc.page.height - 80) {
          doc.addPage();
          currentY = 50;
          
          // Format the date for the report (e.g. Jul-25) for continuation pages
          doc.fontSize(14).font('Helvetica-Bold')
             .text('SOCIAL SECURITY CONTRIBUTIONS (Continued)', { align: 'left' });
          
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES                                 Reg.#${reportNumberDetails.formatted}`, { align: 'left' });
    
          doc.moveDown(0.2);      
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`${monthYear}`, { align: 'left' });
          
          // Move to where the table should start
          currentY = 80;
          
          // Create a border for the entire table
          doc.rect(startX, currentY, pageWidth, 30).stroke();
          
          // Draw table headers in multi-row format as per reference
          // First row
          doc.fontSize(10).font('Helvetica-Bold');
          
          // Draw vertical lines for header row
          doc.moveTo(startX, currentY).lineTo(startX, currentY + 30).stroke(); // Left border
          let headerX = startX;
          columnWidths.forEach(width => {
            headerX += width;
            doc.moveTo(headerX, currentY).lineTo(headerX, currentY + 30).stroke();
          });
          
          // Draw horizontal line after first header row
          doc.moveTo(startX, currentY + 15).lineTo(startX + pageWidth, currentY + 15).stroke();
          
          // First row headers
          doc.text('No.', startX + 5, currentY + 3, { width: columnWidths[0] });
          doc.text('Employee', startX + columnWidths[0] + 5, currentY + 3, { width: columnWidths[1] });
          
          // For "Employees" spanning two columns
          let employeesHeaderX = startX + columnWidths[0] + columnWidths[1] + 5;
          doc.text('Employees', employeesHeaderX, currentY + 3, { width: columnWidths[2] + columnWidths[3] });
          
          // Split columns for Employee/Employer
          doc.text('Employee', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
                   currentY + 3, { width: columnWidths[4], align: 'center' });
          doc.text('Employer', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
                   currentY + 3, { width: columnWidths[5], align: 'center' });
          doc.text('16.00%', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 
                   columnWidths[4] + columnWidths[5] + 5, currentY + 3, { width: columnWidths[6], align: 'center' });
          
          // Second row headers
          doc.text('', startX + 5, currentY + 18, { width: columnWidths[0] }); // No subheader for No.
          doc.text('', startX + columnWidths[0] + 5, currentY + 18, { width: columnWidths[1] }); // No subheader for Employee
          doc.text('', startX + columnWidths[0] + columnWidths[1] + 5, currentY + 18, { width: columnWidths[2] }); // Sex column
          doc.text('Earnings', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
                   currentY + 18, { width: columnWidths[3], align: 'center' });
          doc.text('for month', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
                   currentY + 24, { width: columnWidths[3], align: 'center' });
          doc.text(`${employeeRate}.00%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
                   currentY + 18, { width: columnWidths[4], align: 'center' });
          doc.text(`${employerRate}.00%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
                   currentY + 18, { width: columnWidths[5], align: 'center' });
          doc.text('Contribution', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 
                   columnWidths[4] + columnWidths[5] + 5, currentY + 18, { width: columnWidths[6], align: 'center' });
          
          currentY += 30;
        }
        
        // Draw cells for this row
        doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
        // Draw cell borders
        let cellX = startX;
        columnWidths.forEach(width => {
          cellX += width;
          doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
        });
        
        // Draw cell content
        doc.fontSize(9).font('Helvetica');
        
        // SSN/No.
        const ssnValue = employee.social_security_no || employee.ssn?.formatted || 'N/A';
        doc.text(ssnValue, startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
        
        // Employee name
        doc.text(employeeName, startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
        
        // Sex
        doc.text(employee.formattedGender, startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, 
                { width: columnWidths[2] - 5, align: 'center' });
        
        // Earnings
        doc.text(formatMoney(earnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
                currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
        
        // Employee contribution
        doc.text(formatMoney(employeeContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
        
        // Employer contribution
        doc.text(formatMoney(employerContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + columnWidths[4] + 5, currentY + 8, { width: columnWidths[5] - 5, align: 'right' });
        
        // Total contribution
        doc.text(formatMoney(totalContrib), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, currentY + 8, 
                { width: columnWidths[6] - 5, align: 'right' });
        
        currentY += rowHeight;
      });
      
      // Add totals row
      doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
      // Draw cell borders
      let cellX = startX;
      columnWidths.forEach(width => {
        cellX += width;
        doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
      });
      
      // Draw totals content
      doc.fontSize(9).font('Helvetica-Bold');
      
      // Empty cells for SSN/No. and Sex
      doc.text('', startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
      
      // TOTALS label
      doc.text('TOTALS', startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
      
      // Empty Sex cell
      doc.text('', startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, 
              { width: columnWidths[2] - 5, align: 'center' });
      
      // Total Earnings
      doc.text(formatMoney(totalEarnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
              currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
      
      // Total Employee contribution
      doc.text(formatMoney(totalEmployeeContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
      
      // Total Employer contribution
      doc.text(formatMoney(totalEmployerContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + columnWidths[4] + 5, currentY + 8, { width: columnWidths[5] - 5, align: 'right' });
      
      // Grand total contribution
      doc.text(formatMoney(totalContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, currentY + 8, 
              { width: columnWidths[6] - 5, align: 'right' });
      
      // Finalize the PDF and end the stream
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a Medical Benefits Reporting Form PDF
 * @param {Object} options - Report options
 * @param {number} options.payrollRunId - Payroll run ID
 * @param {Object} options.payrollRunData - Payroll run information
 * @param {string} options.reportNumber - Optional custom report number
 * @param {boolean} options.autoIncrement - Whether to auto-increment report number
 * @returns {Promise<Buffer>} PDF document as buffer
 */
const generateMedicalBenefitsPDF = async ({ payrollRunId, payrollRunData, reportNumber, autoIncrement }) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get settings and employee data
      const settings = await getReportSettings();
      const reportNumberDetails = await getReportNumber(settings, 'mb', reportNumber, autoIncrement);
      const employeeData = await aggregateEmployeeDataByPayrollRun(payrollRunId);
      
      // Create a PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'portrait',
        margin: 30,
        bufferPages: true
      });
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        
        // Update report number if auto-increment is enabled
        if (reportNumberDetails.shouldUpdate) {
          updateReportNumber('mb', reportNumberDetails.newNumber)
            .then(() => resolve(pdfData))
            .catch(error => {
              console.error('Error updating report number:', error);
              resolve(pdfData); // Still return the PDF even if number update fails
            });
        } else {
          resolve(pdfData);
        }
      });
      
      // Set up styling
      const styling = setupPdfStyling(doc);
      const { colors, fonts } = styling;
      
      // Page dimensions
      const pageWidth = doc.page.width - 60;
      const startX = 30;
      const startY = 100; // Start Y position after headers
      
      // Format the date for the report (e.g. Jul-25)
      const payDate = new Date(payrollRunData.pay_date);
      const monthYear = payDate.toLocaleDateString('en-US', { 
        month: 'short', 
        year: '2-digit'
      });
      
      // Add report header with proper formatting
      doc.fontSize(14).font('Helvetica-Bold')
         .text('MEDICAL BENEFIT REPORTING FORM', { align: 'left' });
      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES    Reg.# ${reportNumberDetails.formatted}`, { align: 'left' });
      
      doc.fontSize(10).font('Helvetica')
         .text('P.O. Box W1228, Woods Centre, Antigua.', { align: 'left' });
      
      doc.moveDown(0.2);      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`${monthYear}`, { align: 'left' });
      
      // Define column widths to match reference
      const columnWidths = [80, 90, 30, 100, 90, 90, 90];
      
      // Get rates
      const standardRate = settings.medical_benefits_employee_rate;
      const employerRate = settings.medical_benefits_employer_rate;
      const totalRate = standardRate + employerRate;
      
      // Create a border for the entire table
      doc.rect(startX, startY, pageWidth, 50).stroke();
      
      // Draw table headers in multi-row format as per reference
      // First row
      doc.fontSize(10).font('Helvetica-Bold');
      
      // Draw vertical lines for first header row
      doc.moveTo(startX, startY).lineTo(startX, startY + 50).stroke(); // Left border
      let currentX = startX;
      columnWidths.forEach(width => {
        currentX += width;
        doc.moveTo(currentX, startY).lineTo(currentX, startY + 50).stroke();
      });
      
      // Draw horizontal lines to separate rows in header
      doc.moveTo(startX, startY + 25).lineTo(startX + pageWidth, startY + 25).stroke();
      doc.moveTo(startX, startY + 35).lineTo(startX + columnWidths[0] + columnWidths[1] + columnWidths[2], startY + 35).stroke();
      
      // Header row 1
      doc.text('No.', startX + 5, startY + 5, { width: columnWidths[0] - 5 });
      doc.text('Name of', startX + columnWidths[0] + 5, startY + 5, { width: columnWidths[1] - 5 });
      doc.text('Sex', startX + columnWidths[0] + columnWidths[1] + 5, startY + 5, { width: columnWidths[2] - 5, align: 'center' });
      
      // Employees column spans two rows
      doc.text('Employees', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               startY + 5, { width: columnWidths[3] - 5, align: 'center' });
               
      // Employees / Employers columns
      doc.text('Employees', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               startY + 5, { width: columnWidths[4] - 5, align: 'center' });
      doc.text('Employers', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
               startY + 5, { width: columnWidths[5] - 5, align: 'center' });
      doc.text('Contribution', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, 
               startY + 5, { width: columnWidths[6] - 5, align: 'center' });
      
      // Header row 2 - Employee
      doc.text('Employee', startX + columnWidths[0] + 5, startY + 30, { width: columnWidths[1] - 5 });
      
      // Header row 2 - Earnings
      doc.text('Earnings', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               startY + 30, { width: columnWidths[3] - 5, align: 'center' });
      doc.text('for the', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               startY + 40, { width: columnWidths[3] - 5, align: 'center' });
               
      // Rates
      doc.text(`${standardRate}.50%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               startY + 30, { width: columnWidths[4] - 5, align: 'center' });
      doc.text(`${employerRate}.50%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, 
               startY + 30, { width: columnWidths[5] - 5, align: 'center' });
      doc.text(`${totalRate}%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, 
               startY + 30, { width: columnWidths[6] - 5, align: 'center' });
               
      // Header row 3 - month
      doc.text('month', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
              startY + 40, { width: columnWidths[3] - 5, align: 'center' });
      
      // Add data rows
      let currentY = startY + 50;  // Start after the header rows
      const rowHeight = 25;
      
      // Track totals
      let totalEarnings = 0;
      let totalEmployeeContribution = 0;
      let totalEmployerContribution = 0;
      let totalContribution = 0;
      
      employeeData.forEach(employee => {
        // Skip employees without earnings
        if (parseFloat(employee.total_earnings || 0) === 0) return;
        
        const employeeName = `${employee.first_name} ${employee.last_name}`;
        const earnings = parseFloat(employee.total_earnings || 0);
        const employeeContribution = parseFloat(employee.total_mb_employee || 0);
        const employerContribution = parseFloat(employee.total_mb_employer || 0);
        const totalContrib = employeeContribution + employerContribution;
        
        // Add to totals
        totalEarnings += earnings;
        totalEmployeeContribution += employeeContribution;
        totalEmployerContribution += employerContribution;
        totalContribution += totalContrib;
        
        // Check if we need a new page
        if (currentY > doc.page.height - 80) {
          doc.addPage();
          currentY = 50;
          
          // Format the date for the report (e.g. Jul-25) for continuation pages
          doc.fontSize(14).font('Helvetica-Bold')
             .text('MEDICAL BENEFIT REPORTING FORM (Continued)', { align: 'left' });
          
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES    Reg.# ${reportNumberDetails.formatted}`, { align: 'left' });
          
          doc.fontSize(10).font('Helvetica')
             .text('P.O. Box W1228, Woods Centre, Antigua.', { align: 'left' });
          
          doc.moveDown(0.2);      
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`${monthYear}`, { align: 'left' });
          
          currentY = 100;
          
          // Simple header for continuation
          doc.rect(startX, currentY, pageWidth, 25).stroke();
          doc.fontSize(10).font('Helvetica-Bold');
          
          // Draw column borders
          let headerX = startX;
          columnWidths.forEach(width => {
            headerX += width;
            doc.moveTo(headerX, currentY).lineTo(headerX, currentY + 25).stroke();
          });
          
          // Add simple headers
          doc.text('No.', startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
          doc.text('Employee', startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
          doc.text('Sex', startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, { width: columnWidths[2] - 5, align: 'center' });
          doc.text('Earnings', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, currentY + 8, { width: columnWidths[3] - 5, align: 'center' });
          doc.text(`${standardRate}.50%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'center' });
          doc.text(`${employerRate}.50%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + 5, currentY + 8, { width: columnWidths[5] - 5, align: 'center' });
          doc.text(`${totalRate}%`, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, currentY + 8, { width: columnWidths[6] - 5, align: 'center' });
          
          currentY += 25;
        }
        
        // Draw cells for this row
        doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
        // Draw cell borders
        let cellX = startX;
        columnWidths.forEach(width => {
          cellX += width;
          doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
        });
        
        // Draw cell content
        doc.fontSize(9).font('Helvetica');
        
        // MBF No.
        const mbfNo = employee.medical_benefits_no ? employee.medical_benefits_no : '';
        doc.text(mbfNo, startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
        
        // Employee name
        doc.text(employeeName, startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
        
        // Sex
        doc.text(employee.formattedGender, startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, 
                { width: columnWidths[2] - 5, align: 'center' });
        
        // Earnings
        doc.text(formatMoney(earnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
                currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
        
        // Employee contribution
        doc.text(formatMoney(employeeContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
        
        // Employer contribution
        let empContribText = formatMoney(employerContribution);
        if (employerContribution === 0) {
          empContribText = '$ -';
        }
        doc.text(empContribText, startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + columnWidths[4] + 5, currentY + 8, { width: columnWidths[5] - 5, align: 'right' });
        
        // Total contribution
        doc.text(formatMoney(totalContrib), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, currentY + 8, 
                { width: columnWidths[6] - 5, align: 'right' });
        
        currentY += rowHeight;
      });
      
      // Add totals row
      // Draw the totals row border
      doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
      // Draw cell borders
      let cellX = startX;
      columnWidths.forEach(width => {
        cellX += width;
        doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
      });
      
      // Draw totals content
      doc.fontSize(10).font('Helvetica-Bold');
      
      // TOTALS text
      doc.text('TOTALS', startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
      
      // Total earnings
      doc.text(formatMoney(totalEarnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
              currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
      
      // Total employee contribution
      doc.text(formatMoney(totalEmployeeContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
      
      // Total employer contribution
      doc.text(formatMoney(totalEmployerContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + columnWidths[4] + 5, currentY + 8, { width: columnWidths[5] - 5, align: 'right' });
      
      // Total contribution
      doc.text(formatMoney(totalContribution), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + columnWidths[4] + columnWidths[5] + 5, currentY + 8, 
              { width: columnWidths[6] - 5, align: 'right' });
      
      // Add prepared by section
      currentY += rowHeight + 50;
      
      // Add signature lines
      doc.fontSize(10).font('Helvetica');
      
      // For the employer signature
      doc.text('For the Employer:', startX, currentY);
      doc.moveTo(startX, currentY + 30).lineTo(startX + 200, currentY + 30).stroke();
      doc.fontSize(8).text('(Signature)', startX + 75, currentY + 35);
      
      // For the date
      doc.fontSize(10).font('Helvetica');
      doc.text('Date:', startX + 350, currentY);
      doc.moveTo(startX + 350, currentY + 30).lineTo(startX + 450, currentY + 30).stroke();
      
      // Add generation date at bottom
      currentY += 80;
      
      doc.fontSize(8).font('Helvetica-Oblique').text(`Generated on ${new Date().toLocaleDateString()}`, 
        startX, currentY, { align: 'left' });
      
      // Finalize the PDF and end the stream
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate an Education Levy Report PDF
 * @param {Object} options - Report options
 * @param {number} options.payrollRunId - Payroll run ID
 * @param {Object} options.payrollRunData - Payroll run information
 * @param {string} options.reportNumber - Optional custom report number
 * @param {boolean} options.autoIncrement - Whether to auto-increment report number
 * @returns {Promise<Buffer>} PDF document as buffer
 */
const generateEducationLevyPDF = async ({ payrollRunId, payrollRunData, reportNumber, autoIncrement }) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Get settings and employee data
      const settings = await getReportSettings();
      const reportNumberDetails = await getReportNumber(settings, 'el', reportNumber, autoIncrement);
      const employeeData = await aggregateEmployeeDataByPayrollRun(payrollRunId);
      
      // Create a PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'portrait',
        margin: 50,
        bufferPages: true
      });
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        
        // Update report number if auto-increment is enabled
        if (reportNumberDetails.shouldUpdate) {
          updateReportNumber('el', reportNumberDetails.newNumber)
            .then(() => resolve(pdfData))
            .catch(error => {
              console.error('Error updating report number:', error);
              resolve(pdfData); // Still return the PDF even if number update fails
            });
        } else {
          resolve(pdfData);
        }
      });
      
      // Set up styling
      const styling = setupPdfStyling(doc);
      const { colors, fonts } = styling;
      
      // Page dimensions
      const pageWidth = doc.page.width - 100;
      const startX = 50;
      const startY = 150; // Start Y position after headers
      
      // Format dates for display
      const monthYear = new Date(payrollRunData.pay_period_end).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric'
      });
      
      // Add report header with professional format
      doc.fontSize(14).font('Helvetica-Bold')
         .text('EDUCATION LEVY REPORTING FORM', { align: 'left' });
      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES    Reg.# ${reportNumberDetails.formatted}`, { align: 'left' });
      
      doc.fontSize(10).font('Helvetica')
         .text('P.O. Box W1228, Woods Centre, Antigua.', { align: 'left' });
      
      doc.moveDown(0.2);      
      doc.fontSize(12).font('Helvetica-Bold')
         .text(`${monthYear}`, { align: 'left' });
      
      // Define column widths
      const columnWidths = [80, 190, 50, 130, 100];
      
      // Create table header with multiple rows
      const headerY = startY;
      
      // Draw outer rectangle for header
      doc.rect(startX, headerY, pageWidth, 50).stroke();
      
      // Draw column dividers
      let headerX = startX;
      columnWidths.forEach(width => {
        headerX += width;
        doc.moveTo(headerX, headerY).lineTo(headerX, headerY + 50).stroke();
      });
      
      // Draw the horizontal divider between header rows
      doc.moveTo(startX, headerY + 25).lineTo(startX + pageWidth, headerY + 25).stroke();
      
      // Add header text - first row
      doc.fontSize(10).font('Helvetica-Bold');
      
      // Registration Number
      doc.text('Registration', startX + 10, headerY + 8, { width: columnWidths[0] - 10, align: 'center' });
      doc.text('Number', startX + 10, headerY + 8 + 12, { width: columnWidths[0] - 10, align: 'center' });
      
      // Employee Name
      doc.text('Name', startX + columnWidths[0] + 10, headerY + 8, { width: columnWidths[1] - 10, align: 'center' });
      
      // Sex
      doc.text('Sex', startX + columnWidths[0] + columnWidths[1] + 5, headerY + 8, 
               { width: columnWidths[2] - 10, align: 'center' });
      
      // Earnings
      doc.text('Chargeable', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               headerY + 8, { width: columnWidths[3] - 10, align: 'center' });
      doc.text('Emoluments', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
               headerY + 8 + 12, { width: columnWidths[3] - 10, align: 'center' });
      
      // Deduction
      doc.text('Deductions', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               headerY + 8, { width: columnWidths[4] - 10, align: 'center' });
      doc.text('@3%', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               headerY + 8 + 12, { width: columnWidths[4] - 10, align: 'center' });
      
      // Second row - for additional details and rate information
      const secondRowY = headerY + 25;
      
      // Add additional header information
      doc.fontSize(9);
      
      // Name & Address area
      doc.text('Name & Address of Employer', startX + columnWidths[0] + 5, secondRowY + 8, 
               { width: columnWidths[1] - 10 });
      
      // Rate text for deductions
      doc.text('EC$500,000 and over', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               secondRowY + 5, { width: columnWidths[4] - 10, align: 'center' });
      doc.text('2.5%', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, 
               secondRowY + 15, { width: columnWidths[4] - 10, align: 'center' });
      
      // Add data rows
      let currentY = startY + 50; // Start after the header rows
      const rowHeight = 25;
      
      // Track totals
      let totalEarnings = 0;
      let totalDeductions = 0;
      
      employeeData.forEach(employee => {
        // Skip employees without earnings
        if (parseFloat(employee.total_earnings || 0) === 0) return;
        
        const employeeName = `${employee.first_name} ${employee.last_name}`;
        const earnings = parseFloat(employee.total_earnings || 0);
        const deduction = parseFloat(employee.total_education_levy || 0);
        
        // For monthly frequencies, only include education levy
        const shouldInclude = employee.payment_frequency === 'Monthly' || 
                              employee.payment_frequency === 'Semi-Monthly';
        
        if (!shouldInclude || deduction === 0) return;
        
        // Add to totals
        totalEarnings += earnings;
        totalDeductions += deduction;
        
        // Check if we need a new page
        if (currentY > doc.page.height - 80) {
          doc.addPage();
          currentY = 50;
          
          // Format the date for the report (e.g. Jul-25) for continuation pages
          doc.fontSize(14).font('Helvetica-Bold')
             .text('EDUCATION LEVY REPORTING FORM (Continued)', { align: 'left' });
          
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`EMPLOYER: MEDICAL SURGICAL ASSOCIATES    Reg.# ${reportNumberDetails.formatted}`, { align: 'left' });
          
          doc.fontSize(10).font('Helvetica')
             .text('P.O. Box W1228, Woods Centre, Antigua.', { align: 'left' });
          
          doc.moveDown(0.2);      
          doc.fontSize(12).font('Helvetica-Bold')
             .text(`${monthYear}`, { align: 'left' });
          
          currentY = 100;
          
          // Simple header for continuation
          doc.rect(startX, currentY, pageWidth, 25).stroke();
          doc.fontSize(10).font('Helvetica-Bold');
          
          // Draw column borders
          let headerX = startX;
          columnWidths.forEach(width => {
            headerX += width;
            doc.moveTo(headerX, currentY).lineTo(headerX, currentY + 25).stroke();
          });
          
          // Add simple headers
          doc.text('Reg. No.', startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
          doc.text('Employee', startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
          doc.text('Sex', startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, { width: columnWidths[2] - 5, align: 'center' });
          doc.text('Earnings', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, currentY + 8, { width: columnWidths[3] - 5, align: 'center' });
          doc.text('Deduction', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'center' });
          
          currentY += 25;
        }
        
        // Draw cells for this row
        doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
        // Draw cell borders
        let cellX = startX;
        columnWidths.forEach(width => {
          cellX += width;
          doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
        });
        
        // Draw cell content
        doc.fontSize(9).font('Helvetica');
        
        // Registration Number (use direct social_security_no value if available)
        const regNumber = employee.social_security_no || (employee.ssn ? employee.ssn.formatted : '');
        doc.text(regNumber, startX + 5, currentY + 8, { width: columnWidths[0] - 5 });
        
        // Employee name
        doc.text(employeeName, startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
        
        // Sex
        doc.text(employee.formattedGender, startX + columnWidths[0] + columnWidths[1] + 5, currentY + 8, 
                { width: columnWidths[2] - 5, align: 'center' });
        
        // Earnings
        doc.text(formatMoney(earnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
                currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
        
        // Deduction
        doc.text(formatMoney(deduction), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
                columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
        
        currentY += rowHeight;
      });
      
      // Add totals row
      // Draw the totals row border
      doc.rect(startX, currentY, pageWidth, rowHeight).stroke();
        
      // Draw cell borders
      let cellX = startX;
      columnWidths.forEach(width => {
        cellX += width;
        doc.moveTo(cellX, currentY).lineTo(cellX, currentY + rowHeight).stroke();
      });
      
      // Draw totals content
      doc.fontSize(10).font('Helvetica-Bold');
      
      // TOTALS text
      doc.text('TOTALS', startX + columnWidths[0] + 5, currentY + 8, { width: columnWidths[1] - 5 });
      
      // Total earnings
      doc.text(formatMoney(totalEarnings), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 5, 
              currentY + 8, { width: columnWidths[3] - 5, align: 'right' });
      
      // Total deductions
      doc.text(formatMoney(totalDeductions), startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + 
              columnWidths[3] + 5, currentY + 8, { width: columnWidths[4] - 5, align: 'right' });
      
      // Add prepared by section
      currentY += rowHeight + 50;
      
      // Add signature lines
      doc.fontSize(10).font('Helvetica');
      
      // For the employer signature
      doc.text('For the Employer:', startX, currentY);
      doc.moveTo(startX, currentY + 30).lineTo(startX + 200, currentY + 30).stroke();
      doc.fontSize(8).text('(Signature)', startX + 75, currentY + 35);
      
      // For the date
      doc.fontSize(10).font('Helvetica');
      doc.text('Date:', startX + 350, currentY);
      doc.moveTo(startX + 350, currentY + 30).lineTo(startX + 450, currentY + 30).stroke();
      
      // Add generation date at bottom
      currentY += 80;
      
      doc.fontSize(8).font('Helvetica-Oblique').text(`Generated on ${new Date().toLocaleDateString()}`, 
        startX, currentY, { align: 'left' });
      
      // Finalize the PDF and end the stream
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate employee data for government reports in JSON format
 * @param {string} reportType - Report type ('ss', 'mb', 'el')
 * @param {number} payrollRunId - Payroll run ID
 * @returns {Promise<Object>} Formatted report data for API response
 */
const generateReportData = async (reportType, payrollRunId) => {
  // Get settings and employee data
  const settings = await getReportSettings();
  const reportNumberDetails = await getReportNumber(settings, reportType, null, false);
  const employeeData = await aggregateEmployeeDataByPayrollRun(payrollRunId);
  
  // Get payroll run information for period display
  const payrollRunInfo = employeeData[0]; // All rows will have the same payroll run info
  
  // Base response with report metadata
  const response = {
    reportType,
    reportNumber: reportNumberDetails.formatted,
    payrollRunId,
    payDate: payrollRunInfo ? new Date(payrollRunInfo.pay_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    period: payrollRunInfo ? formatDateRange(payrollRunInfo.pay_period_start, payrollRunInfo.pay_period_end) : '',
    generatedAt: new Date().toISOString(),
    rows: [],
    totals: {}
  };
  
  // Format data based on report type
  switch (reportType) {
    case 'ss':
      // Track totals
      let ssEarningsTotal = 0;
      let ssEmployeeTotal = 0;
      let ssEmployerTotal = 0;
      let ssTotalContribution = 0;
      
      // Format each employee row
      response.rows = employeeData
        .filter(employee => parseFloat(employee.total_earnings || 0) > 0)
        .map(employee => {
          const earnings = parseFloat(employee.total_earnings || 0);
          const employeeContribution = parseFloat(employee.total_ss_employee || 0);
          const employerContribution = parseFloat(employee.total_ss_employer || 0);
          const totalContribution = employeeContribution + employerContribution;
          
          // Add to totals
          ssEarningsTotal += earnings;
          ssEmployeeTotal += employeeContribution;
          ssEmployerTotal += employerContribution;
          ssTotalContribution += totalContribution;
          
          return {
            employee_id: employee.employee_id,
            name: `${employee.first_name} ${employee.last_name}`,
            department: employee.department_name || 'Unassigned',
            ssn: {
              value: employee.social_security_no || (employee.ssn ? employee.ssn.formatted : 'N/A'),
              valid: employee.social_security_no ? true : (employee.ssn ? employee.ssn.valid : false)
            },
            earnings: formatMoney(earnings),
            employee_contribution: formatMoney(employeeContribution),
            employer_contribution: formatMoney(employerContribution),
            total_contribution: formatMoney(totalContribution)
          };
        });
      
      // Set totals
      response.totals = {
        earnings: formatMoney(ssEarningsTotal),
        employee_contribution: formatMoney(ssEmployeeTotal),
        employer_contribution: formatMoney(ssEmployerTotal),
        total_contribution: formatMoney(ssTotalContribution)
      };
      
      // Add rate information
      response.rates = {
        employee_rate: settings.social_security_employee_rate,
        employer_rate: settings.social_security_employer_rate,
        total_rate: settings.social_security_employee_rate + settings.social_security_employer_rate
      };
      break;
      
    case 'mb':
      // Track totals
      let mbEarningsTotal = 0;
      let mbEmployeeTotal = 0;
      let mbEmployerTotal = 0;
      let mbTotalContribution = 0;
      
      // Format each employee row
      response.rows = employeeData
        .filter(employee => parseFloat(employee.total_earnings || 0) > 0)
        .map(employee => {
          const earnings = parseFloat(employee.total_earnings || 0);
          const employeeContribution = parseFloat(employee.total_mb_employee || 0);
          const employerContribution = parseFloat(employee.total_mb_employer || 0);
          const totalContribution = employeeContribution + employerContribution;
          
          // Determine employee rate based on age
          const isSenior = employee.age >= settings.medical_benefits_senior_age && 
                           employee.age < settings.medical_benefits_max_age;
          const isExempt = employee.age >= settings.medical_benefits_max_age;
          const employeeRate = isExempt ? 0 : 
                               (isSenior ? settings.medical_benefits_employee_senior_rate : 
                                          settings.medical_benefits_employee_rate);
          
          // Add to totals
          mbEarningsTotal += earnings;
          mbEmployeeTotal += employeeContribution;
          mbEmployerTotal += employerContribution;
          mbTotalContribution += totalContribution;
          
          return {
            employee_id: employee.employee_id,
            name: `${employee.first_name} ${employee.last_name}`,
            department: employee.department_name || 'Unassigned',
            mbf_no: employee.medical_benefits_no || 'N/A',
            sex: employee.formattedGender,
            age: employee.age,
            earnings: formatMoney(earnings),
            employee_rate: employeeRate,
            employee_contribution: formatMoney(employeeContribution),
            employer_contribution: formatMoney(employerContribution),
            total_contribution: formatMoney(totalContribution)
          };
        });
      
      // Set totals
      response.totals = {
        earnings: formatMoney(mbEarningsTotal),
        employee_contribution: formatMoney(mbEmployeeTotal),
        employer_contribution: formatMoney(mbEmployerTotal),
        total_contribution: formatMoney(mbTotalContribution)
      };
      
      // Add rate information
      response.rates = {
        standard_employee_rate: settings.medical_benefits_employee_rate,
        senior_employee_rate: settings.medical_benefits_employee_senior_rate,
        employer_rate: settings.medical_benefits_employer_rate,
        senior_age: settings.medical_benefits_senior_age,
        max_age: settings.medical_benefits_max_age
      };
      break;
      
    case 'el':
      // Track totals
      let elEarningsTotal = 0;
      let elDeductionTotal = 0;
      
      // Format each employee row
      response.rows = employeeData
        .filter(employee => {
          // Only include Monthly and Semi-Monthly frequencies
          const shouldInclude = employee.payment_frequency === 'Monthly' || 
                               employee.payment_frequency === 'Semi-Monthly';
          const hasEarnings = parseFloat(employee.total_earnings || 0) > 0;
          const hasDeduction = parseFloat(employee.total_education_levy || 0) > 0;
          
          return shouldInclude && hasEarnings && hasDeduction;
        })
        .map(employee => {
          const earnings = parseFloat(employee.total_earnings || 0);
          const deduction = parseFloat(employee.total_education_levy || 0);
          
          // Add to totals
          elEarningsTotal += earnings;
          elDeductionTotal += deduction;
          
          return {
            employee_id: employee.employee_id,
            name: `${employee.first_name} ${employee.last_name}`,
            department: employee.department_name || 'Unassigned',
            ssn: {
              value: employee.social_security_no || (employee.ssn ? employee.ssn.formatted : 'N/A'),
              valid: employee.social_security_no ? true : (employee.ssn ? employee.ssn.valid : false)
            },
            sex: employee.formattedGender,
            earnings: formatMoney(earnings),
            deduction: formatMoney(deduction)
          };
        });
      
      // Set totals
      response.totals = {
        earnings: formatMoney(elEarningsTotal),
        deduction: formatMoney(elDeductionTotal)
      };
      
      // Add rate information
      response.rates = {
        standard_rate: settings.education_levy_rate,
        high_rate: settings.education_levy_high_rate,
        threshold: settings.education_levy_threshold,
        exemption: settings.education_levy_exemption
      };
      break;
  }
  
  return response;
};

module.exports = {
  generateSocialSecurityPDF,
  generateMedicalBenefitsPDF,
  generateEducationLevyPDF,
  generateReportData,
  validateSSN
};
