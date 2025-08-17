const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a paystub PDF
 * @param {Object} payrollItem - Payroll item with payment details
 * @param {Object} periodData - Pay period information
 * @param {Object} options - PDF generation options
 * @param {Object} [options.employeeDetails] - Additional employee details from employees table
 * @param {Array} [options.loanDetails] - Loan details including payment amounts and remaining balances
 * @returns {Buffer} PDF document as buffer
 */
const generatePaystubPDF = async (payrollItem, periodData, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      // Create a PDF document with portrait orientation and autoFirstPage disabled to manage pages manually
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'portrait', // Portrait orientation for better content fit
        margin: 20, // Further reduced margins to fit more content on one page
        autoFirstPage: false,
        bufferPages: true // Enable buffer pages to control pagination
      });
      
      // Define colors for better visual appeal
      const colors = {
        primary: '#0f4c81',     // Professional blue
        secondary: '#3c8dbc',   // Light blue for sub-headings
        accent: '#f39c12',      // Orange for highlights
        text: '#333333',        // Dark gray for text
        lightGray: '#f4f4f4',   // Light gray for table rows
        border: '#dddddd'       // Border color
      };
      
      // Add first page manually to have better control - must do this before accessing page properties
      doc.addPage({size: 'LETTER', layout: 'portrait', margin: 20}); // Portrait with even smaller margins
      
      // Define page dimensions and margins for better layout management - AFTER adding the first page
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 20; // Further reduced margin to fit more content on a single page
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Add a more compact background rectangle for the header
      doc.rect(margin, margin, pageWidth - (margin * 2), 50)
         .fillAndStroke(colors.primary, colors.primary);
      
      // Add company header text in white - smaller font sizes
      doc.fillColor('white')
         .fontSize(22).font('Helvetica-Bold').text('MSA Payroll System', margin + 10, margin + 8, { align: 'left' });
      doc.fontSize(12).font('Helvetica').text('Antigua Payroll Services', margin + 10, margin + 30, { align: 'left' });
      
      // Add period information in a more compact box on the right
      doc.roundedRect(pageWidth - (margin + 200), margin, 175, 50, 5)
         .fillAndStroke('white', colors.border);
      
      doc.fillColor(colors.primary)
         .fontSize(14).font('Helvetica-Bold').text('PAYSTUB', pageWidth - (margin + 190), margin + 8, { align: 'left' });
      
      doc.fillColor(colors.text)
         .fontSize(10).font('Helvetica').text(`Period: ${periodData.periodStart} to ${periodData.periodEnd}`, 
                                             pageWidth - (margin + 190), margin + 24, { align: 'left' });
      doc.fontSize(10).text(`Pay Date: ${periodData.payDate}`, pageWidth - (margin + 190), margin + 38, { align: 'left' });
      
      // Add more compact employee information section with light background
      const empInfoY = margin + 60; // Positioned closer to header
      doc.rect(margin, empInfoY, pageWidth - (margin * 2), 70) // Reduced height
         .fillAndStroke(colors.lightGray, colors.border);
      
      // Section title with colored background - more compact
      doc.rect(margin, empInfoY, 150, 20)
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(12).font('Helvetica-Bold')
         .text('Employee Information', margin + 10, empInfoY + 5);
      
      // Get employee details from options or directly from payrollItem
      const employeeDetails = options.employeeDetails || {};
      const employeeName = payrollItem.employee_name;
      const employeeId = payrollItem.employee_id;
      
      // Get employee type from employee details or payrollItem
      const employeeType = employeeDetails.employee_type;
      
      // Get salary and hourly rate from employee details first, then payrollItem
      const hourlyRate = employeeDetails.hourly_rate || 0;
      const salaryAmount = employeeDetails.salary_amount  || 0;
      const standardHours = employeeDetails.standard_hours  || 40;
      
      // Calculate if salary is prorated based on hours worked compared to standard
      const regularHours = payrollItem.regular_hours ||  0;
      const isProrated = employeeType === 'salary' && parseFloat(regularHours) < (standardHours * 4);
      
      // Create two columns for employee info - more compact
      doc.fillColor(colors.text).fontSize(9).font('Helvetica');
      const empInfoContentY = empInfoY + 25; // Less spacing
      const empColWidth = (pageWidth - (margin * 2) - 20) / 2;
      const col1X = margin + 10;
      const col2X = margin + empColWidth + 10; // Less spacing
      
      // Left column - reduced vertical spacing
      doc.text(`Name: ${employeeName}`, col1X, empInfoContentY);
      doc.text(`Employee ID: ${employeeId || 'N/A'}`, col1X, empInfoContentY + 14);
      
      // Employment type string
      let empTypeString = 'Hourly';
      if (employeeType === 'salary') {
        empTypeString = 'Salaried';
      } else if (employeeType === 'private_duty_nurse') {
        empTypeString = 'Private Duty Nurse';
      }
      doc.text(`Employment Type: ${empTypeString}`, col1X, empInfoContentY + 28);
      
      // Right column - reduced vertical spacing
      if (employeeType === 'salary') {
        doc.text(`Monthly Salary: $${parseFloat(salaryAmount || 0).toFixed(2)}`, col2X, empInfoContentY);
        if (isProrated) {
          doc.text(`Status: Prorated (${regularHours}/${standardHours * 4} hrs)`, col2X, empInfoContentY + 14);
        }
      } else if (employeeType === 'private_duty_nurse') {
        // Get private duty nurse rates from payroll settings if available
        const nurseSetting = options.payrollSettings || {};
        const dayWeekdayRate = nurseSetting.private_duty_nurse_day_weekday || 35.00;
        const nightAllRate = nurseSetting.private_duty_nurse_night_all || 40.00;
        const dayWeekendRate = nurseSetting.private_duty_nurse_day_weekend || 40.00;
        
        doc.text(`Rate: Variable (shift-based)`, col2X, empInfoContentY);
        doc.text(`Weekday: $${parseFloat(dayWeekdayRate).toFixed(2)} / Wknd: $${parseFloat(dayWeekendRate).toFixed(2)}`, col2X, empInfoContentY + 14);
        doc.text(`Night: $${parseFloat(nightAllRate).toFixed(2)}`, col2X, empInfoContentY + 28);
      } else {
        doc.text(`Hourly Rate: $${parseFloat(hourlyRate || 0).toFixed(2)}`, col2X, empInfoContentY);
      }
      
      // Define table positions and widths for the portrait layout - more compact
      const tablesStartY = empInfoY + 80; // Start closer to employee info
      const tableWidth = (pageWidth - (margin * 2));
      const halfTableWidth = (tableWidth - 10) / 2; // Two tables side by side
      const leftTableX = margin;
      const rightTableX = margin + halfTableWidth + 10;
      const colWidth = halfTableWidth / 3;
      
      // Earnings section on the left side - more compact
      doc.rect(leftTableX, tablesStartY, halfTableWidth, 20) // Reduced height
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(12).font('Helvetica-Bold')
         .text('Earnings', leftTableX + 10, tablesStartY + 5);
      
      // Table header background - more compact
      doc.rect(leftTableX, tablesStartY + 20, halfTableWidth, 18)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text - smaller font
      doc.fillColor(colors.text)
         .fontSize(9).font('Helvetica-Bold')
         .text('Description', leftTableX + 5, tablesStartY + 20 + 5, { width: colWidth - 5, align: 'left' })
         .text('Hours', leftTableX + colWidth, tablesStartY + 20 + 5, { width: colWidth - 5, align: 'right' })
         .text('Amount', leftTableX + colWidth * 2, tablesStartY + 20 + 5, { width: colWidth - 10, align: 'right' });
      
      // Handle data for earnings calculations
      const hoursWorked = payrollItem.hoursWorked || payrollItem.hours_worked || 0;
      const overtimeHours = payrollItem.overtimeHours || payrollItem.overtime_hours || 0;
      const overtimeAmount = parseFloat(payrollItem.overtimeAmount || payrollItem.overtime_amount || 0).toFixed(2);
      
      // Get vacation hours and pay
      const vacationHours = payrollItem.vacationHours || payrollItem.vacation_hours || 0;
      const vacationAmount = parseFloat(payrollItem.vacationAmount || payrollItem.vacation_amount || 0).toFixed(2);
      
      // Calculate regular earnings (gross pay minus overtime and vacation)
      const grossPay = parseFloat(payrollItem.grossPay || payrollItem.gross_pay || 0).toFixed(2);
      const regularEarnings = (parseFloat(grossPay) - parseFloat(overtimeAmount) - parseFloat(vacationAmount)).toFixed(2);
      
      // Setup for earnings detail rows - reduced height for compact layout
      const rowHeight = 18; // Smaller row height
      let currentY = tablesStartY + 38; // Less spacing
      
      // Determine earnings description
      const employeeTypeForCalc = payrollItem.employee_type || employeeType;
      const isHourly = employeeTypeForCalc !== 'salary';
      const isNurse = employeeTypeForCalc === 'private_duty_nurse';
      let calculationDescription;
      
      if (isNurse) {
        calculationDescription = `Private Duty Nurse Pay`;
      } else if (isHourly) {
        calculationDescription = `Hourly Pay`;
      } else {
        calculationDescription = `Regular Salary${parseFloat(regularHours) < standardHours ? ' (Prorated)' : ''}`;
      }
      
      // Alternate row background colors - using halfTableWidth
      doc.rect(leftTableX, currentY, halfTableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
      
      // Regular earnings row - smaller font
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text(calculationDescription, leftTableX + 5, currentY + 5, { width: colWidth - 5, align: 'left' })
         .text(regularHours.toString(), leftTableX + colWidth, currentY + 5, { width: colWidth - 5, align: 'right' })
         .text(`$${regularEarnings}`, leftTableX + colWidth * 2, currentY + 5, { width: colWidth - 10, align: 'right' });
      
      currentY += rowHeight;
      
      // Add overtime line if applicable - more compact
      if (parseFloat(overtimeHours) > 0 && parseFloat(overtimeAmount) > 0) {
        currentY += rowHeight;
        doc.rect(leftTableX, currentY, halfTableWidth, rowHeight)
           .fillAndStroke(colors.lightGray, colors.border);
           
        doc.fillColor(colors.text).fontSize(8).font('Helvetica')
           .text('Overtime (1.5x)', leftTableX + 5, currentY + 5, { width: colWidth - 5, align: 'left' })
           .text(overtimeHours.toString(), leftTableX + colWidth, currentY + 5, { width: colWidth - 5, align: 'right' })
           .text(`$${overtimeAmount}`, leftTableX + colWidth * 2, currentY + 5, { width: colWidth - 10, align: 'right' });
      }
      
      // Add vacation pay if applicable - more compact
      if (parseFloat(vacationHours) > 0 || parseFloat(vacationAmount) > 0) {
        currentY += rowHeight;
        doc.rect(leftTableX, currentY, halfTableWidth, rowHeight)
           .fillAndStroke('white', colors.border);
           
        doc.fillColor(colors.text).fontSize(8).font('Helvetica')
           .text('Vacation Pay', leftTableX + 5, currentY + 5, { width: colWidth - 5, align: 'left' })
           .text(vacationHours.toString(), leftTableX + colWidth, currentY + 5, { width: colWidth - 5, align: 'right' })
           .text(`$${vacationAmount}`, leftTableX + colWidth * 2, currentY + 5, { width: colWidth - 10, align: 'right' });
      }
      
      // Gross pay total with highlighted background - more compact
      currentY += rowHeight;
      doc.rect(leftTableX, currentY, halfTableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('Gross Pay', leftTableX + 5, currentY + 5, { width: colWidth - 5, align: 'left' })
         .text('', leftTableX + colWidth, currentY + 5, { width: colWidth - 5, align: 'right' })
         .text(`$${grossPay}`, leftTableX + colWidth * 2, currentY + 5, { width: colWidth - 10, align: 'right' });
      
      // Update currentY to the bottom of the gross pay row
      currentY += rowHeight;

      // Deductions section on the right side - more compact
      doc.rect(rightTableX, tablesStartY, halfTableWidth, 20) // Reduced height
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(12).font('Helvetica-Bold')
         .text('Deductions', rightTableX + 10, tablesStartY + 5);
      
      // Table header background - more compact
      doc.rect(rightTableX, tablesStartY + 20, halfTableWidth, 18)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text - smaller font
      doc.fillColor(colors.text)
         .fontSize(9).font('Helvetica-Bold')
         .text('Description', rightTableX + 5, tablesStartY + 20 + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text('Amount', rightTableX + colWidth * 2, tablesStartY + 20 + 5, { width: colWidth - 10, align: 'right' });
      
      // Handle deductions data
      const socialSecurityEmployee = parseFloat(payrollItem.social_security_employee || 0).toFixed(2);
      const medicalBenefitsEmployee = parseFloat(payrollItem.medical_benefits_employee || 0).toFixed(2);
      const educationLevy = parseFloat(payrollItem.education_levy || 0).toFixed(2);
      const loanDeduction = parseFloat(payrollItem.loan_deduction || 0).toFixed(2);
      const internalLoanDeduction = parseFloat(payrollItem.internal_loan_deduction || 0).toFixed(2);
      const thirdPartyDeduction = parseFloat(payrollItem.third_party_deduction || 0).toFixed(2);
      
      // Setup for deductions detail rows - more compact
      let deductionY = tablesStartY + 38; // Less spacing
      
      // Social Security - white row - more compact
      doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Social Security (7%)', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text(`$${socialSecurityEmployee}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
      
      deductionY += rowHeight;
      
      // Medical Benefits - gray row - more compact
      doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Medical Benefits', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text(`$${medicalBenefitsEmployee}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
      
      deductionY += rowHeight;
      
      // Education Levy - white row - more compact
      doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Education Levy', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text(`$${educationLevy}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
      
      deductionY += rowHeight;
      
      // Handle internal loan deduction - more compact
      if (parseFloat(internalLoanDeduction) > 0) {
        doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
           .fillAndStroke(colors.lightGray, colors.border);
           
        doc.fillColor(colors.text).fontSize(8).font('Helvetica')
           .text('Loan Repayment', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
           .text(`$${internalLoanDeduction}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
        
        deductionY += rowHeight;
      }
      
      // Handle third-party loan deduction - more compact
      if (parseFloat(thirdPartyDeduction) > 0) {
        const rowBg = (deductionY / rowHeight) % 2 === 0 ? 'white' : colors.lightGray;
        doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
           .fillAndStroke(rowBg, colors.border);
           
        doc.fillColor(colors.text).fontSize(8).font('Helvetica')
           .text('Misc. Deductions', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
           .text(`$${thirdPartyDeduction}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
        
        deductionY += rowHeight;
      }
      
      // Calculate totals
      const statutoryDeductions = parseFloat(socialSecurityEmployee) + parseFloat(medicalBenefitsEmployee) + 
                               parseFloat(educationLevy);
      const totalDeductions = statutoryDeductions + parseFloat(loanDeduction);
      
      // Total Deductions - highlighted row - more compact
      doc.rect(rightTableX, deductionY, halfTableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('Total Deductions', rightTableX + 5, deductionY + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text(`$${totalDeductions.toFixed(2)}`, rightTableX + colWidth * 2, deductionY + 5, { width: colWidth - 10, align: 'right' });
      
      deductionY += rowHeight;
      
      // Net Pay section - add a gap and then a highlight box
      const netPay = parseFloat(payrollItem.netPay || payrollItem.net_pay || 0).toFixed(2);
      
      // Net pay box with accent color - more compact
      const netPayBoxY = deductionY + 5;
      const netPayBoxHeight = rowHeight;
      doc.rect(rightTableX, netPayBoxY, halfTableWidth, netPayBoxHeight)
         .fillAndStroke(colors.accent, colors.accent);
         
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('NET PAY', rightTableX + 5, netPayBoxY + 5, { width: colWidth * 2 - 5, align: 'left' })
         .text(`$${netPay}`, rightTableX + colWidth * 2, netPayBoxY + 5, { width: colWidth - 10, align: 'right' });
      
      // Calculate the bottom of the deductions section (net pay box)
      const deductionsBottom = netPayBoxY + netPayBoxHeight;

      // Now, the bottom of the two tables is the maximum of the bottom of the earnings table (currentY) and the deductionsBottom
      const tablesBottom = Math.max(currentY, deductionsBottom);
      
      // Set the starting Y for the employer contributions section with a smaller gap
      const employerContribY = tablesBottom + 10; // Reduced spacing

      // Add employer contributions section on first page - more compact
      // Section header with colored background
      doc.rect(leftTableX, employerContribY, tableWidth, 20) // Full width for employer section
         .fillAndStroke(colors.secondary, colors.secondary);
         
      doc.fillColor('white')
         .fontSize(12).font('Helvetica-Bold')
         .text('Employer Contributions', leftTableX + 10, employerContribY + 5);
         
      // Table header background - more compact
      doc.rect(leftTableX, employerContribY + 20, tableWidth, 18)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text - smaller font
      doc.fillColor(colors.text)
         .fontSize(9).font('Helvetica-Bold')
         .text('Description', leftTableX + 5, employerContribY + 20 + 5, { width: colWidth * 4 - 5, align: 'left' })
         .text('Amount', leftTableX + colWidth * 5, employerContribY + 20 + 5, { width: colWidth - 10, align: 'right' });
      
      // Get employer contributions data
      const socialSecurityEmployer = parseFloat(payrollItem.socialSecurityEmployer || payrollItem.social_security_employer || 0).toFixed(2);
      const medicalBenefitsEmployer = parseFloat(payrollItem.medicalBenefitsEmployer || payrollItem.medical_benefits_employer || 0).toFixed(2);
      
      // Row 1: Employer Social Security - more compact, full width
      doc.rect(leftTableX, employerContribY + 38, tableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Social Security (9%)', leftTableX + 5, employerContribY + 38 + 5, { width: colWidth * 4, align: 'left' })
         .text(`$${socialSecurityEmployer}`, leftTableX + colWidth * 5, employerContribY + 38 + 5, { width: colWidth - 10, align: 'right' });
      
      // Row 2: Employer Medical Benefits - more compact, full width
      doc.rect(leftTableX, employerContribY + 38 + rowHeight, tableWidth, rowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Medical Benefits', leftTableX + 5, employerContribY + 38 + rowHeight + 5, { width: colWidth * 4, align: 'left' })
         .text(`$${medicalBenefitsEmployer}`, leftTableX + colWidth * 5, employerContribY + 38 + rowHeight + 5, { width: colWidth - 10, align: 'right' });
      
      // Total row with highlight - more compact, full width
      const totalEmployerContributions = parseFloat(socialSecurityEmployer) + parseFloat(medicalBenefitsEmployer);
      
      doc.rect(leftTableX, employerContribY + 38 + rowHeight * 2, tableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('Total Employer Contributions', leftTableX + 5, employerContribY + 38 + rowHeight * 2 + 5, { width: colWidth * 4, align: 'left' })
         .text(`$${totalEmployerContributions.toFixed(2)}`, leftTableX + colWidth * 5, employerContribY + 38 + rowHeight * 2 + 5, { width: colWidth - 10, align: 'right' });
      
      // Add YTD Summary right after employer contributions on the same page
      const ytdY = employerContribY + 38 + rowHeight * 3 + 10;
      
      // YTD Summary section header with colored background
      doc.rect(leftTableX, ytdY, tableWidth, 20)
         .fillAndStroke(colors.secondary, colors.secondary);
         
      doc.fillColor('white')
         .fontSize(12).font('Helvetica-Bold')
         .text('Year-To-Date Summary', leftTableX + 10, ytdY + 5);
      
      // YTD table header background
      doc.rect(leftTableX, ytdY + 20, tableWidth, 18)
         .fillAndStroke('#e9ecef', colors.border);
      
      // YTD column widths - using full width table
      const ytdColWidth = tableWidth / 3;
      
      // Table header text
      doc.fillColor(colors.text)
         .fontSize(9).font('Helvetica-Bold')
         .text('Description', leftTableX + 5, ytdY + 20 + 5, { width: ytdColWidth - 5, align: 'left' })
         .text('Current', leftTableX + ytdColWidth, ytdY + 20 + 5, { width: ytdColWidth - 5, align: 'center' })
         .text('Year-To-Date', leftTableX + ytdColWidth * 2, ytdY + 20 + 5, { width: ytdColWidth - 5, align: 'right' });
      
      // YTD data handling
      const ytdGrossPay = parseFloat(payrollItem.ytdGrossPay || payrollItem.ytd_gross_pay || 0).toFixed(2);
      const ytdSocialSecurityEmployee = parseFloat(payrollItem.ytdSocialSecurityEmployee || payrollItem.ytd_social_security_employee || 0).toFixed(2);
      const ytdMedicalBenefitsEmployee = parseFloat(payrollItem.ytdMedicalBenefitsEmployee || payrollItem.ytd_medical_benefits_employee || 0).toFixed(2);
      const ytdEducationLevy = parseFloat(payrollItem.ytdEducationLevy || payrollItem.ytd_education_levy || 0).toFixed(2);
      const ytdNetPay = parseFloat(payrollItem.ytdNetPay || payrollItem.ytd_net_pay || 0).toFixed(2);
      const ytdHoursWorked = parseFloat(payrollItem.ytdHoursWorked || payrollItem.ytd_hours_worked || 0).toFixed(2);
      const ytdVacationHours = parseFloat(payrollItem.ytdVacationHours || payrollItem.ytd_vacation_hours || 0).toFixed(2);
      const ytdVacationAmount = parseFloat(payrollItem.ytdVacationAmount || payrollItem.ytd_vacation_amount || 0).toFixed(2);
      
      // Calculate row height based on available space - more compact
      const ytdRowHeight = 16;
      let currentYtdY = ytdY + 38;
      
      // Row 1: Gross Pay - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Gross Pay', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`$${grossPay}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`$${ytdGrossPay}`, leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 2: Deductions - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Total Deductions', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`$${totalDeductions.toFixed(2)}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`$${(parseFloat(ytdSocialSecurityEmployee) + parseFloat(ytdMedicalBenefitsEmployee) + parseFloat(ytdEducationLevy)).toFixed(2)}`, 
                leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 3: Hours Worked - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Hours Worked', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`${regularHours}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`${ytdHoursWorked}`, leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 4: Vacation Hours - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Vacation Hours', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`${vacationHours}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`${ytdVacationHours}`, leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 5: Vacation Amount - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('Vacation Amount', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`$${vacationAmount}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`$${ytdVacationAmount}`, leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 6: Net Pay - compact
      doc.rect(leftTableX, currentYtdY, tableWidth, ytdRowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('Net Pay', leftTableX + 5, currentYtdY + 4, { width: ytdColWidth - 5, align: 'left' })
         .text(`$${netPay}`, leftTableX + ytdColWidth, currentYtdY + 4, { width: ytdColWidth - 5, align: 'center' })
         .text(`$${ytdNetPay}`, leftTableX + ytdColWidth * 2, currentYtdY + 4, { width: ytdColWidth - 5, align: 'right' });
      
      // Add loan/vacation information if available
      let extraContentHeight = 0;
      
      if (options.loanDetails && options.loanDetails.length > 0) {
        // Add compact loan details on the first page
        const loanY = currentYtdY + 20; // Reduced spacing
        const loanInfoX = margin;
        const loanWidth = tableWidth;
        
        doc.rect(loanInfoX, loanY, loanWidth, 20) // Reduced height
          .fillAndStroke(colors.secondary, colors.secondary);
          
        doc.fillColor('white')
          .fontSize(9).font('Helvetica-Bold') // Smaller font
          .text('Loan Information', loanInfoX + 10, loanY + 5);
          
        const internalLoans = options.loanDetails.filter(loan => loan.loan_type !== 'third_party');
        const thirdPartyLoans = options.loanDetails.filter(loan => loan.loan_type === 'third_party');
        
        doc.fillColor(colors.text).fontSize(7).font('Helvetica'); // Smaller font
        
        let currentLoanY = loanY + 5;
        
        if (internalLoans.length > 0) {
          let loanDetails = 'Internal: ';
          internalLoans.forEach((loan, idx) => {
            const payment = parseFloat(loan.paymentAmount || loan.payment || 0).toFixed(2);
            const balance = parseFloat(loan.remainingBalance || 0).toFixed(2);
            loanDetails += `#${loan.loanId || loan.id} ($${payment} payment, $${balance} remaining)`;
            if (idx < internalLoans.length - 1) loanDetails += '; ';
          });
          doc.text(loanDetails, loanInfoX + 100, currentLoanY, { width: loanWidth - 110, align: 'left' });
          currentLoanY += 10;
        }
        
        if (thirdPartyLoans.length > 0) {
          let tpLoanDetails = 'Third Party: ';
          thirdPartyLoans.forEach((loan, idx) => {
            const payment = parseFloat(loan.paymentAmount || loan.payment || 0).toFixed(2);
            const balance = parseFloat(loan.remainingBalance || 0).toFixed(2);
            tpLoanDetails += `${loan.provider || 'External'} #${loan.loanId || loan.id} ($${payment} payment, $${balance} remaining)`;
            if (idx < thirdPartyLoans.length - 1) tpLoanDetails += '; ';
          });
          doc.text(tpLoanDetails, loanInfoX + 100, currentLoanY, { width: loanWidth - 110, align: 'left' });
        }
        
        extraContentHeight += thirdPartyLoans.length > 0 ? 35 : 25;
      }
      
      // Add vacation information if available
      if (payrollItem.vacation_balance !== undefined || payrollItem.annual_pto_hours !== undefined) {
        const vacationY = currentYtdY + 20 + (options.loanDetails && options.loanDetails.length > 0 ? extraContentHeight : 0);
        const vacationInfoX = margin;
        const vacInfoWidth = tableWidth;
        
        const vacationBalance = parseFloat(payrollItem.vacation_balance || 0).toFixed(2);
        const annualPtoHours = parseFloat(payrollItem.annual_pto_hours || 0).toFixed(2);
        
        doc.rect(vacationInfoX, vacationY, vacInfoWidth, 20)
          .fillAndStroke(colors.secondary, colors.secondary);
          
        doc.fillColor('white')
          .fontSize(9).font('Helvetica-Bold') // Smaller font
          .text('Vacation Entitlement', vacationInfoX + 10, vacationY + 5);
          
        doc.fillColor(colors.text).fontSize(7).font('Helvetica') // Smaller font
          .text(`Annual: ${annualPtoHours} hrs`, vacationInfoX + 150, vacationY + 5, { width: 100, align: 'left' })
          .text(`Balance: ${vacationBalance} hrs`, vacationInfoX + 250, vacationY + 5, { width: 100, align: 'left' });
        
        extraContentHeight += 25;
      }
      
      // Add a footer with gradient background - positioned after all content
      const footerY = pageHeight - 20;
      doc.rect(margin, footerY - 35, pageWidth - (margin * 2), 15)
         .fillAndStroke('#f8f9fa', '#e9ecef');
         
      doc.fillColor(colors.text).fontSize(7).font('Helvetica')
         .text('This is an electronic paystub and does not require a signature.', margin + 10, footerY-30, { width: 300, align: 'left' })
         .text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - (margin + 80), footerY-30, { width: 70, align: 'right' });
      
      // Add a subtle watermark that won't cause page issues
      doc.fillOpacity(0.05)
         .fillColor(colors.primary)
         .fontSize(50).font('Helvetica-Bold') // Smaller font size for watermark
         .text('MSA PAYROLL', pageWidth/2 - 125, pageHeight/2, { 
           align: 'center',
           width: 250,
           continued: true
         });
      
      // Reset opacity for rest of document
      doc.fillOpacity(1);
      
      // Handle multiple pages properly
      // We don't need to force single page or manually remove pages
      // Instead, let PDFKit handle the page management naturally
      doc.switchToPage(0); // Just make sure we end on the first page
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generatePaystubPDF };