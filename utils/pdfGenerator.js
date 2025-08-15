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
      // Create a PDF document with landscape orientation
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margin: 30
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
      
      // Define page dimensions and margins for better layout management
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 30;
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Add a background rectangle for the header
      doc.rect(margin, margin, pageWidth - (margin * 2), 80)
         .fillAndStroke(colors.primary, colors.primary);
      
      // Add company header text in white
      doc.fillColor('white')
         .fontSize(28).font('Helvetica-Bold').text('MSA Payroll System', margin + 10, margin + 15, { align: 'left' });
      doc.fontSize(14).font('Helvetica').text('Antigua Payroll Services', margin + 10, margin + 45, { align: 'left' });
      
      // Add period information in a box on the right
      doc.roundedRect(pageWidth - (margin + 250), margin, 220, 80, 5)
         .fillAndStroke('white', colors.border);
      
      doc.fillColor(colors.primary)
         .fontSize(16).font('Helvetica-Bold').text('PAYSTUB', pageWidth - (margin + 240), margin + 10, { align: 'left' });
      
      doc.fillColor(colors.text)
         .fontSize(12).font('Helvetica').text(`Pay Period: ${periodData.periodStart} to ${periodData.periodEnd}`, 
                                             pageWidth - (margin + 240), margin + 30, { align: 'left' });
      doc.fontSize(12).text(`Pay Date: ${periodData.payDate}`, pageWidth - (margin + 240), margin + 50, { align: 'left' });
      
      // Add employee information section with light background
      const empInfoY = margin + 90;
      doc.rect(margin, empInfoY, pageWidth - (margin * 2), 95)
         .fillAndStroke(colors.lightGray, colors.border);
      
      // Section title with colored background
      doc.rect(margin, empInfoY, 200, 25)
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(14).font('Helvetica-Bold')
         .text('Employee Information', margin + 10, empInfoY + 7);
      
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
      
      // Create two columns for employee info
      doc.fillColor(colors.text).fontSize(11).font('Helvetica');
      const empInfoContentY = empInfoY + 35;
      const empColWidth = (pageWidth - (margin * 2) - 30) / 2;
      const col1X = margin + 10;
      const col2X = margin + empColWidth + 20;
      
      // Left column
      doc.text(`Name: ${employeeName}`, col1X, empInfoContentY);
      doc.text(`Employee ID: ${employeeId || 'N/A'}`, col1X, empInfoContentY + 18);
      
      // Employment type string
      let empTypeString = 'Hourly';
      if (employeeType === 'salary') {
        empTypeString = 'Salaried';
      } else if (employeeType === 'private_duty_nurse') {
        empTypeString = 'Private Duty Nurse';
      }
      doc.text(`Employment Type: ${empTypeString}`, col1X, empInfoContentY + 36);
      
      // Right column
      if (employeeType === 'salary') {
        doc.text(`Monthly Salary: $${parseFloat(salaryAmount || 0).toFixed(2)}`, col2X, empInfoContentY);
        if (isProrated) {
          doc.text(`Status: Prorated (${regularHours}/${standardHours * 4} hrs)`, col2X, empInfoContentY + 18);
        }
      } else if (employeeType === 'private_duty_nurse') {
        // Get private duty nurse rates from payroll settings if available
        const nurseSetting = options.payrollSettings || {};
        const dayWeekdayRate = nurseSetting.private_duty_nurse_day_weekday || 35.00;
        const nightAllRate = nurseSetting.private_duty_nurse_night_all || 40.00;
        const dayWeekendRate = nurseSetting.private_duty_nurse_day_weekend || 40.00;
        
        doc.text(`Rate: Variable (shift-based)`, col2X, empInfoContentY);
        doc.text(`Weekday: $${parseFloat(dayWeekdayRate).toFixed(2)} / Weekend: $${parseFloat(dayWeekendRate).toFixed(2)}`, col2X, empInfoContentY + 18);
        doc.text(`Night: $${parseFloat(nightAllRate).toFixed(2)}`, col2X, empInfoContentY + 36);
      } else {
        doc.text(`Hourly Rate: $${parseFloat(hourlyRate || 0).toFixed(2)}`, col2X, empInfoContentY);
      }
      
      // This section has been replaced by the improved employee information section above
      
      // Define table positions and widths for the landscape layout
      const tablesStartY = empInfoY + 105;
      const leftTableX = margin;
      const rightTableX = margin + (pageWidth - (margin * 2)) / 2 + 10;
      const tableWidth = (pageWidth - (margin * 2) - 20) / 2;
      const colWidth = tableWidth / 3;
      
      // Earnings section on the left side
      doc.rect(leftTableX, tablesStartY, tableWidth, 25)
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(14).font('Helvetica-Bold')
         .text('Earnings', leftTableX + 10, tablesStartY + 7);
      
      // Table header background
      doc.rect(leftTableX, tablesStartY + 25, tableWidth, 20)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text
      doc.fillColor(colors.text)
         .fontSize(10).font('Helvetica-Bold')
         .text('Description', leftTableX + 10, tablesStartY + 25 + 5, { width: colWidth - 10, align: 'left' })
         .text('Hours', leftTableX + colWidth, tablesStartY + 25 + 5, { width: colWidth, align: 'right' })
         .text('Amount', leftTableX + colWidth * 2, tablesStartY + 25 + 5, { width: colWidth - 15, align: 'right' });
      
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
      
      // Log data for debugging
      console.log('PDF Generation - Payroll Item:', {
        employeeName: payrollItem.employee_name || payrollItem.employeeName,
        employeeId: payrollItem.employeeId || payrollItem.employee_id || payrollItem.employee_number,
        employeeType: employeeType,
        grossPay: grossPay,
        regularHours: regularHours,
        overtimeHours: overtimeHours,
        overtimeAmount: overtimeAmount,
        vacationHours: vacationHours,
        vacationAmount: vacationAmount
      });
      
      // Setup for earnings detail rows
      const rowHeight = 22;
      let currentY = tablesStartY + 45;
      
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
      
      // Alternate row background colors
      doc.rect(leftTableX, currentY, tableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
      
      // Regular earnings row
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text(calculationDescription, leftTableX + 10, currentY + 6, { width: colWidth - 10, align: 'left' })
         .text(regularHours.toString(), leftTableX + colWidth, currentY + 6, { width: colWidth - 10, align: 'right' })
         .text(`$${regularEarnings}`, leftTableX + colWidth * 2, currentY + 6, { width: colWidth - 15, align: 'right' });
      
      currentY += rowHeight;
      
      // Add overtime line if applicable
      if (parseFloat(overtimeHours) > 0 && parseFloat(overtimeAmount) > 0) {
        currentY += rowHeight;
        doc.rect(leftTableX, currentY, tableWidth, rowHeight)
           .fillAndStroke(colors.lightGray, colors.border);
           
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text('Overtime (1.5x)', leftTableX + 10, currentY + 6, { width: colWidth - 10, align: 'left' })
           .text(overtimeHours.toString(), leftTableX + colWidth, currentY + 6, { width: colWidth - 10, align: 'right' })
           .text(`$${overtimeAmount}`, leftTableX + colWidth * 2, currentY + 6, { width: colWidth - 15, align: 'right' });
      }
      
      // Add vacation pay if applicable
      if (parseFloat(vacationHours) > 0 || parseFloat(vacationAmount) > 0) {
        currentY += rowHeight;
        doc.rect(leftTableX, currentY, tableWidth, rowHeight)
           .fillAndStroke('white', colors.border);
           
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text('Vacation Pay', leftTableX + 10, currentY + 6, { width: colWidth - 10, align: 'left' })
           .text(vacationHours.toString(), leftTableX + colWidth, currentY + 6, { width: colWidth - 10, align: 'right' })
           .text(`$${vacationAmount}`, leftTableX + colWidth * 2, currentY + 6, { width: colWidth - 15, align: 'right' });
      }
      
      // Gross pay total with highlighted background
      currentY += rowHeight;
      doc.rect(leftTableX, currentY, tableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('Gross Pay', leftTableX + 10, currentY + 6, { width: colWidth - 10, align: 'left' })
         .text('', leftTableX + colWidth, currentY + 6, { width: colWidth - 10, align: 'right' })
         .text(`$${grossPay}`, leftTableX + colWidth * 2, currentY + 6, { width: colWidth - 15, align: 'right' });
      
      // Deductions section on the right side
      doc.rect(rightTableX, tablesStartY, tableWidth, 25)
         .fillAndStroke(colors.secondary, colors.secondary);
      
      doc.fillColor('white')
         .fontSize(14).font('Helvetica-Bold')
         .text('Deductions', rightTableX + 10, tablesStartY + 7);
      
      // Table header background
      doc.rect(rightTableX, tablesStartY + 25, tableWidth, 20)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text
      doc.fillColor(colors.text)
         .fontSize(10).font('Helvetica-Bold')
         .text('Description', rightTableX + 10, tablesStartY + 25 + 5, { width: colWidth * 2 - 10, align: 'left' })
         .text('Amount', rightTableX + colWidth * 2, tablesStartY + 25 + 5, { width: colWidth - 15, align: 'right' });
      
      // Handle deductions data
      const socialSecurityEmployee = parseFloat(payrollItem.social_security_employee || 0).toFixed(2);
      const medicalBenefitsEmployee = parseFloat(payrollItem.medical_benefits_employee || 0).toFixed(2);
      const educationLevy = parseFloat(payrollItem.education_levy || 0).toFixed(2);
      const loanDeduction = parseFloat(payrollItem.loan_deduction || 0).toFixed(2);
      const internalLoanDeduction = parseFloat(payrollItem.internal_loan_deduction || 0).toFixed(2);
      const thirdPartyDeduction = parseFloat(payrollItem.third_party_deduction || 0).toFixed(2);
      
      // Setup for deductions detail rows
      let deductionY = tablesStartY + 45;
      
      // Social Security - white row
      doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Social Security (7%)', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${socialSecurityEmployee}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
      
      deductionY += rowHeight;
      
      // Medical Benefits - gray row
      doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Medical Benefits', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${medicalBenefitsEmployee}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
      
      deductionY += rowHeight;
      
      // Education Levy - white row
      doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Education Levy', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${educationLevy}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
      
      deductionY += rowHeight;
      
      // Handle internal loan deduction
      if (parseFloat(internalLoanDeduction) > 0) {
        doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
           .fillAndStroke(colors.lightGray, colors.border);
           
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text('Loan Repayment', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
           .text(`$${internalLoanDeduction}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
        
        deductionY += rowHeight;
      }
      
      // Handle third-party loan deduction
      if (parseFloat(thirdPartyDeduction) > 0) {
        const rowBg = (deductionY / rowHeight) % 2 === 0 ? 'white' : colors.lightGray;
        doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
           .fillAndStroke(rowBg, colors.border);
           
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text('Misc. Deductions', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
           .text(`$${thirdPartyDeduction}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
        
        deductionY += rowHeight;
      }
      
      // Calculate totals
      const statutoryDeductions = parseFloat(socialSecurityEmployee) + parseFloat(medicalBenefitsEmployee) + 
                               parseFloat(educationLevy);
      const totalDeductions = statutoryDeductions + parseFloat(loanDeduction);
      
      // Total Deductions - highlighted row
      doc.rect(rightTableX, deductionY, tableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('Total Deductions', rightTableX + 10, deductionY + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${totalDeductions.toFixed(2)}`, rightTableX + colWidth * 2, deductionY + 6, { width: colWidth - 15, align: 'right' });
      
      deductionY += rowHeight;
      
      // Net Pay section - add a gap and then a highlight box
      const netPay = parseFloat(payrollItem.netPay || payrollItem.net_pay || 0).toFixed(2);
      
      // Net pay box with accent color
      doc.rect(rightTableX, deductionY + 10, tableWidth, rowHeight + 5)
         .fillAndStroke(colors.accent, colors.accent);
         
      doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
         .text('NET PAY', rightTableX + 10, deductionY + 15, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${netPay}`, rightTableX + colWidth * 2, deductionY + 15, { width: colWidth - 15, align: 'right' });
      
      // Add employer contributions section on first page
      const employerContribY = 380;
      
      // Section header with colored background
      doc.rect(leftTableX, employerContribY, tableWidth, 25)
         .fillAndStroke(colors.secondary, colors.secondary);
         
      doc.fillColor('white')
         .fontSize(14).font('Helvetica-Bold')
         .text('Employer Contributions', leftTableX + 10, employerContribY + 7);
         
      // Table header background
      doc.rect(leftTableX, employerContribY + 25, tableWidth, 20)
         .fillAndStroke('#e9ecef', colors.border);
         
      // Table header text
      doc.fillColor(colors.text)
         .fontSize(10).font('Helvetica-Bold')
         .text('Description', leftTableX + 10, employerContribY + 25 + 5, { width: colWidth * 2 - 10, align: 'left' })
         .text('Amount', leftTableX + colWidth * 2, employerContribY + 25 + 5, { width: colWidth - 15, align: 'right' });
      
      // Get employer contributions data
      const socialSecurityEmployer = parseFloat(payrollItem.socialSecurityEmployer || payrollItem.social_security_employer || 0).toFixed(2);
      const medicalBenefitsEmployer = parseFloat(payrollItem.medicalBenefitsEmployer || payrollItem.medical_benefits_employer || 0).toFixed(2);
      
      // Row 1: Employer Social Security
      doc.rect(leftTableX, employerContribY + 45, tableWidth, rowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Social Security (9%)', leftTableX + 10, employerContribY + 45 + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${socialSecurityEmployer}`, leftTableX + colWidth * 2, employerContribY + 45 + 6, { width: colWidth - 15, align: 'right' });
      
      // Row 2: Employer Medical Benefits
      doc.rect(leftTableX, employerContribY + 45 + rowHeight, tableWidth, rowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Medical Benefits', leftTableX + 10, employerContribY + 45 + rowHeight + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${medicalBenefitsEmployer}`, leftTableX + colWidth * 2, employerContribY + 45 + rowHeight + 6, { width: colWidth - 15, align: 'right' });
      
      // Total row with highlight
      const totalEmployerContributions = parseFloat(socialSecurityEmployer) + parseFloat(medicalBenefitsEmployer);
      
      doc.rect(leftTableX, employerContribY + 45 + rowHeight * 2, tableWidth, rowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('Total Employer Contributions', leftTableX + 10, employerContribY + 45 + rowHeight * 2 + 6, { width: colWidth * 2 - 10, align: 'left' })
         .text(`$${totalEmployerContributions.toFixed(2)}`, leftTableX + colWidth * 2, employerContribY + 45 + rowHeight * 2 + 6, { width: colWidth - 15, align: 'right' });
      
      // Add a footer with gradient background for first page
      doc.rect(30, doc.page.height - 30, doc.page.width - 60, 20)
         .fillAndStroke('#f8f9fa', '#e9ecef');
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('This is an electronic paystub and does not require a signature.', 40, doc.page.height - 25, { width: 300, align: 'left' })
         .text('Page 1 of 2', doc.page.width - 250, doc.page.height - 25, { width: 240, align: 'right' });
      
      // Add a new page for YTD summary and loan information
      doc.addPage({size: 'LETTER', layout: 'landscape', margin: 30});
      
      // Add a background rectangle for the header on page 2
      doc.rect(margin, margin, pageWidth - (margin * 2), 50)
         .fillAndStroke(colors.primary, colors.primary);
      
      // Add company header text in white
      doc.fillColor('white')
         .fontSize(22).font('Helvetica-Bold').text('MSA Payroll System - Additional Details', margin + 10, margin + 15, { align: 'left' });
      
      // YTD Summary Section - Top of page 2
      const ytdY = margin + 60;
      
      // Section header with colored background
      doc.rect(margin, ytdY, tableWidth * 1.5, 25)
         .fillAndStroke(colors.secondary, colors.secondary);
         
      doc.fillColor('white')
         .fontSize(14).font('Helvetica-Bold')
         .text('Year-To-Date Summary', margin + 10, ytdY + 7);
         
      // Table header background
      doc.rect(margin, ytdY + 25, tableWidth * 1.5, 20)
         .fillAndStroke('#e9ecef', colors.border);
      
      // YTD table has three columns
      const ytdColWidth = tableWidth / 2;
      
      // Table header text
      doc.fillColor(colors.text)
         .fontSize(10).font('Helvetica-Bold')
         .text('Description', margin + 10, ytdY + 25 + 5, { width: ytdColWidth - 10, align: 'left' })
         .text('Current Period', margin + ytdColWidth, ytdY + 25 + 5, { width: ytdColWidth - 10, align: 'right' })
         .text('Year-To-Date', margin + ytdColWidth * 2, ytdY + 25 + 5, { width: ytdColWidth - 10, align: 'right' });
      
      // YTD data handling
      const ytdGrossPay = parseFloat(payrollItem.ytdGrossPay || payrollItem.ytd_gross_pay || 0).toFixed(2);
      const ytdSocialSecurityEmployee = parseFloat(payrollItem.ytdSocialSecurityEmployee || payrollItem.ytd_social_security_employee || 0).toFixed(2);
      const ytdMedicalBenefitsEmployee = parseFloat(payrollItem.ytdMedicalBenefitsEmployee || payrollItem.ytd_medical_benefits_employee || 0).toFixed(2);
      const ytdEducationLevy = parseFloat(payrollItem.ytdEducationLevy || payrollItem.ytd_education_levy || 0).toFixed(2);
      const ytdNetPay = parseFloat(payrollItem.ytdNetPay || payrollItem.ytd_net_pay || 0).toFixed(2);
      const ytdHoursWorked = parseFloat(payrollItem.ytdHoursWorked || payrollItem.ytd_hours_worked || 0).toFixed(2);
      const ytdVacationHours = parseFloat(payrollItem.ytdVacationHours || payrollItem.ytd_vacation_hours || 0).toFixed(2);
      const ytdVacationAmount = parseFloat(payrollItem.ytdVacationAmount || payrollItem.ytd_vacation_amount || 0).toFixed(2);
      
      // Determine how many rows we need to display
      let ytdRows = 3; // Minimum: gross pay, total deductions, net pay
      if (parseFloat(vacationHours) > 0 || parseFloat(ytdVacationHours) > 0) {
        ytdRows += 1; // Add vacation row
      }
      
      // Calculate row height based on available space
      const ytdRowHeight = 20;
      let currentYtdY = ytdY + 45;
      
      // Row 1: Gross Pay (white)
      doc.rect(margin, currentYtdY, tableWidth * 1.5, ytdRowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Gross Pay', margin + 10, currentYtdY + 5, { width: ytdColWidth - 10, align: 'left' })
         .text(`$${grossPay}`, margin + ytdColWidth, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' })
         .text(`$${ytdGrossPay}`, margin + ytdColWidth * 2, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 2: Total Deductions (gray)
      doc.rect(margin, currentYtdY, tableWidth * 1.5, ytdRowHeight)
         .fillAndStroke(colors.lightGray, colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Total Deductions', margin + 10, currentYtdY + 5, { width: ytdColWidth - 10, align: 'left' })
         .text(`$${totalDeductions.toFixed(2)}`, margin + ytdColWidth, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' })
         .text(`$${(parseFloat(ytdSocialSecurityEmployee) + parseFloat(ytdMedicalBenefitsEmployee) + parseFloat(ytdEducationLevy)).toFixed(2)}`, 
                margin + ytdColWidth * 2, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 3: Hours Worked (white)
      doc.rect(margin, currentYtdY, tableWidth * 1.5, ytdRowHeight)
         .fillAndStroke('white', colors.border);
         
      doc.fillColor(colors.text).fontSize(10).font('Helvetica')
         .text('Hours Worked', margin + 10, currentYtdY + 5, { width: ytdColWidth - 10, align: 'left' })
         .text(hoursWorked.toString(), margin + ytdColWidth, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' })
         .text(ytdHoursWorked, margin + ytdColWidth * 2, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' });
      
      currentYtdY += ytdRowHeight;
      
      // Row 4: Vacation (if applicable)
      if (parseFloat(vacationHours) > 0 || parseFloat(ytdVacationHours) > 0) {
        doc.rect(margin, currentYtdY, tableWidth * 1.5, ytdRowHeight)
           .fillAndStroke(colors.lightGray, colors.border);
           
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text('Vacation Pay', margin + 10, currentYtdY + 5, { width: ytdColWidth - 10, align: 'left' })
           .text(`$${vacationAmount}`, margin + ytdColWidth, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' })
           .text(`$${ytdVacationAmount}`, margin + ytdColWidth * 2, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' });
        
        currentYtdY += ytdRowHeight;
      }
      
      // Final row: Net Pay (highlighted)
      doc.rect(margin, currentYtdY, tableWidth * 1.5, ytdRowHeight)
         .fillAndStroke(colors.primary, colors.primary);
         
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
         .text('Net Pay', margin + 10, currentYtdY + 5, { width: ytdColWidth - 10, align: 'left' })
         .text(`$${netPay}`, margin + ytdColWidth, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' })
         .text(`$${ytdNetPay}`, margin + ytdColWidth * 2, currentYtdY + 5, { width: ytdColWidth - 10, align: 'right' });
        
      // Add compact loan information on page 2 if needed
      if ((parseFloat(internalLoanDeduction) > 0 || parseFloat(thirdPartyDeduction) > 0) && 
          options.loanDetails && options.loanDetails.length > 0) {
            
        // Create a loan information box below YTD summary
        const loanY = currentYtdY + 30; // Position after YTD table
        const loanWidth = doc.page.width - 60;
        
        // Box with light background and border
        doc.rect(margin, loanY, loanWidth, 80)
           .fillAndStroke(colors.lightGray, colors.border);
        
        // Section title bar
        doc.rect(margin, loanY, 200, 25)
           .fillAndStroke(colors.secondary, colors.secondary);
           
        doc.fillColor('white')
           .fontSize(14).font('Helvetica-Bold')
           .text('Loan Information', margin + 10, loanY + 7);
           
        // Show compact loan details - internal loans first
        const internalLoans = options.loanDetails.filter(loan => loan.loan_type !== 'third_party');
        const thirdPartyLoans = options.loanDetails.filter(loan => loan.loan_type === 'third_party');
        
        doc.fillColor(colors.text).fontSize(10).font('Helvetica');
        
        if (internalLoans.length > 0) {
          let loanDetails = 'Internal: ';
          internalLoans.forEach((loan, idx) => {
            const payment = parseFloat(loan.paymentAmount || loan.payment || 0).toFixed(2);
            const balance = parseFloat(loan.remainingBalance || 0).toFixed(2);
            loanDetails += `#${loan.loanId || loan.id} ($${payment} payment, $${balance} remaining)`;
            if (idx < internalLoans.length - 1) loanDetails += '; ';
          });
          doc.text(loanDetails, margin + 210, loanY + 7, { width: loanWidth - 230, align: 'left' });
        }
        
        if (thirdPartyLoans.length > 0) {
          let tpDetails = 'Third-party: ';
          thirdPartyLoans.forEach((loan, idx) => {
            const payment = parseFloat(loan.paymentAmount || loan.payment || 0).toFixed(2);
            tpDetails += `${loan.third_party_name || 'Third-Party'} ($${payment})`;
            if (idx < thirdPartyLoans.length - 1) tpDetails += '; ';
          });
          doc.text(tpDetails, margin + 210, loanY + 35, { width: loanWidth - 230, align: 'left' });
        }
      }

      // Add vacation information on page 2 if applicable
      if (payrollItem.vacation_balance !== undefined || payrollItem.annual_pto_hours !== undefined) {
        // Create a vacation information box 
        const vacationY = currentYtdY + (options.loanDetails && options.loanDetails.length > 0 ? 140 : 30);
        const vacationBalance = parseFloat(payrollItem.vacation_balance || 0).toFixed(2);
        const annualPtoHours = parseFloat(payrollItem.annual_pto_hours || 0).toFixed(2);
        
        // Box with light background and border
        doc.rect(margin, vacationY, doc.page.width - (margin * 2), 70)
           .fillAndStroke(colors.lightGray, colors.border);
        
        // Section title bar
        doc.rect(margin, vacationY, 200, 25)
           .fillAndStroke(colors.secondary, colors.secondary);
           
        doc.fillColor('white')
           .fontSize(14).font('Helvetica-Bold')
           .text('Vacation Entitlement', margin + 10, vacationY + 7);
           
        // Vacation details
        doc.fillColor(colors.text).fontSize(10).font('Helvetica')
           .text(`Annual PTO Allocation: ${annualPtoHours} hours`, margin + 210, vacationY + 7, { width: 200, align: 'left' })
           .text(`Current Vacation Balance: ${vacationBalance} hours`, margin + 420, vacationY + 7, { width: 200, align: 'left' });
        
        if (payrollItem.accrual_rate_per_hour) {
          const accrualRate = parseFloat(payrollItem.accrual_rate_per_hour || 0).toFixed(6);
          doc.text(`Accrual Rate: ${accrualRate} hours per hour worked`, margin + 210, vacationY + 35, { width: 300, align: 'left' });
        }
      }
      
      // Add footer with gradient background on page 2
      doc.rect(margin, doc.page.height - 30, doc.page.width - (margin * 2), 20)
         .fillAndStroke('#f8f9fa', '#e9ecef');
         
      doc.fillColor(colors.text).fontSize(8).font('Helvetica')
         .text('This is an electronic paystub and does not require a signature.', margin + 10, doc.page.height - 25, { width: 300, align: 'left' })
         .text(`Page 2 of 2 | Generated on ${new Date().toLocaleString()}`, doc.page.width - 250, doc.page.height - 25, { width: 240, align: 'right' });
      
      // Add subtle watermark/logo on second page
      doc.fillOpacity(0.05)
         .fillColor(colors.primary)
         .fontSize(80).font('Helvetica-Bold')
         .text('MSA PAYROLL', doc.page.width/2 - 150, doc.page.height/2 - 40, { align: 'center' });
      
      // Reset opacity for rest of document
      doc.fillOpacity(1);
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generatePaystubPDF };
