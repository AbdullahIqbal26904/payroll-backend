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
      // Create a PDF document
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50
      });
      
      // Collect the PDF data in memory
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Add company header
      doc.fontSize(20).font('Helvetica-Bold').text('MSA Payroll System', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Antigua Payroll Services', { align: 'center' });
      doc.moveDown();
      
      // Add period information
      doc.fontSize(16).font('Helvetica-Bold').text('PAYSTUB', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Pay Period: ${periodData.periodStart} to ${periodData.periodEnd}`, { align: 'center' });
      doc.fontSize(10).text(`Pay Date: ${periodData.payDate}`, { align: 'center' });
      doc.moveDown();
      
      // Add employee information
      doc.fontSize(12).font('Helvetica-Bold').text('Employee Information');
      doc.fontSize(10).font('Helvetica');
      
      // Get employee details from options or directly from payrollItem
      const employeeDetails = options.employeeDetails || {};
      const employeeName = payrollItem.employee_name;
      const employeeId = payrollItem.employee_id;
      
      // Get employee type from employee details or payrollItem
      const employeeType = employeeDetails.employee_type || payrollItem.employeeType || payrollItem.employee_type;
      
      // Get salary and hourly rate from employee details first, then payrollItem
      const hourlyRate = employeeDetails.hourly_rate || payrollItem.hourly_rate || 0;
      const salaryAmount = employeeDetails.salary_amount  || payrollItem.salary_amount || 0;
      const standardHours = employeeDetails.standard_hours  || payrollItem.standard_hours || 40;
      
      // Calculate if salary is prorated based on hours worked compared to standard
      const regularHours = payrollItem.regular_hours ||  0;
      const isProrated = employeeType === 'salary' && parseFloat(regularHours) < (standardHours * 4);
      
      doc.text(`Name: ${employeeName}`);
      doc.text(`Employee ID: ${employeeId || 'N/A'}`);
      
      // Show correct employment type
      if (employeeType === 'salary') {
        doc.text(`Employment Type: Salaried`);
      } else if (employeeType === 'private_duty_nurse') {
        doc.text(`Employment Type: Private Duty Nurse`);
      } else {
        doc.text(`Employment Type: Hourly`);
      }
      
      if (employeeType === 'salary') {
        doc.text(`Monthly Salary: $${parseFloat(salaryAmount || 0).toFixed(2)}`);
        if (isProrated) {
          doc.text(`Salary Status: Prorated (worked ${regularHours} of ${standardHours * 4} monthly hours)`);
        }
      } else if (employeeType === 'private_duty_nurse') {
        doc.text(`Hourly Rate: Variable (shift-based)`);
      } else {
        doc.text(`Hourly Rate: $${parseFloat(hourlyRate || 0).toFixed(2)}`);
      }
      doc.moveDown();
      
      // Add earnings section
      doc.fontSize(12).font('Helvetica-Bold').text('Earnings');
      doc.moveDown(0.5);
      
      // Create a table-like structure for earnings
      const tableWidth = 500;
      const colWidth = tableWidth / 3;
      
      // Table header
      doc.font('Helvetica-Bold')
        .text('Description', 50, doc.y, { width: colWidth, align: 'left' })
        .text('Hours', 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text('Amount', 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveTo(50, doc.y + 5)
        .lineTo(550, doc.y + 5)
        .stroke();
      doc.moveDown(0.5);
      
      // We already have employeeType from above, no need to redeclare
      // Handle both camelCase and snake_case property names
      const hoursWorked = payrollItem.hoursWorked || payrollItem.hours_worked || 0;
      // regularHours is already declared above
      const overtimeHours = payrollItem.overtimeHours || payrollItem.overtime_hours || 0;
      const overtimeAmount = parseFloat(payrollItem.overtimeAmount || payrollItem.overtime_amount || 0).toFixed(2);
      
      // Calculate regular earnings (gross pay minus overtime)
      const grossPay = parseFloat(payrollItem.grossPay || payrollItem.gross_pay || 0).toFixed(2);
      const regularEarnings = (parseFloat(grossPay) - parseFloat(overtimeAmount)).toFixed(2);
      
      // Log data for debugging
      console.log('PDF Generation - Payroll Item:', {
        employeeName: payrollItem.employee_name || payrollItem.employeeName,
        employeeId: payrollItem.employeeId || payrollItem.employee_id || payrollItem.employee_number,
        employeeType: employeeType,
        grossPay: grossPay,
        regularHours: regularHours,
        overtimeHours: overtimeHours,
        overtimeAmount: overtimeAmount
      });
      
      // Regular earnings
      const employeeTypeForCalc = payrollItem.employeeType || payrollItem.employee_type || employeeType;
      const isHourly = employeeTypeForCalc !== 'salary';
      const isNurse = employeeTypeForCalc === 'private_duty_nurse';
      // standardHours is already declared above
      let calculationDescription;
      
      if (isNurse) {
        calculationDescription = `Private Duty Nurse Pay (Variable Shift Rates)`;
      } else if (isHourly) {
        calculationDescription = `Hourly Pay (${parseFloat(payrollItem.hourlyRate || payrollItem.hourly_rate || 0).toFixed(2)}/hour)`;
      } else {
        calculationDescription = `Regular Salary${parseFloat(regularHours) < standardHours ? ' (Prorated)' : ''}`;
      }
      
      doc.font('Helvetica')
        .text(calculationDescription, 50, doc.y, { width: colWidth, align: 'left' })
        .text(regularHours.toString(), 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${regularEarnings}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add overtime line if applicable (for salaried employees with overtime)
      if (parseFloat(overtimeHours) > 0 && parseFloat(overtimeAmount) > 0) {
        doc.moveDown(0.5);
        doc.font('Helvetica')
          .text('Overtime (1.5x)', 50, doc.y, { width: colWidth, align: 'left' })
          .text(overtimeHours.toString(), 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
          .text(`$${overtimeAmount}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
          
        // Add overtime calculation explanation if it's a salaried employee
        if ((payrollItem.employeeType || payrollItem.employee_type) === 'salary') {
          const salaryAmount = parseFloat(payrollItem.salaryAmount || payrollItem.salary_amount || 0);
          const annualSalary = salaryAmount * 12;
          const hourlyBase = (annualSalary / 52 / 40).toFixed(2);
          doc.fontSize(8).text(
            `Overtime calculation: Annual salary $${annualSalary.toFixed(2)} ÷ 52 weeks ÷ 40 hours × 1.5 = $${(hourlyBase * 1.5).toFixed(2)}/hour`, 
            50, doc.y + 5, { width: tableWidth, align: 'left' }
          );
          doc.fontSize(10);
        }
      }
      
      // Add horizontal line
      doc.moveDown();
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(0.5);
      
      // Gross pay total
      doc.font('Helvetica-Bold')
        .text('Gross Pay', 50, doc.y, { width: colWidth, align: 'left' })
        .text('', 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${grossPay}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      doc.moveDown(1.5);
      
      // Add payment structure details
      const empType = employeeType; // Already defined above
      if (empType) {
        doc.fontSize(10).font('Helvetica-Oblique');
        doc.text('Payment Structure Details:', 50, doc.y, { width: tableWidth, align: 'left' });
        
        if (empType === 'salary') {
          // standardHours is already defined above
          const monthlyHours = standardHours * 4;
          
          // Use the employeeDetails from options if available, otherwise fall back to payrollItem
          const empDetails = options.employeeDetails || {};
          const monthlySalary = parseFloat(empDetails.salary_amount || salaryAmount || 0).toFixed(2);
          
          doc.text(`Salaried employee with monthly rate: $${monthlySalary}`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`Standard weekly hours: ${standardHours} (${monthlyHours} hours/month)`, 70, doc.y, { width: tableWidth, align: 'left' });
          
          if (parseFloat(regularHours) < standardHours * 4 && parseFloat(regularHours) > 0) {
            const prorationFactor = (parseFloat(regularHours) / (standardHours * 4)).toFixed(4);
            doc.text(`Salary prorated at ${(prorationFactor * 100).toFixed(2)}% due to working ${regularHours} of ${monthlyHours} monthly hours`, 
              70, doc.y, { width: tableWidth, align: 'left' });
          }
        } else if (empType === 'private_duty_nurse') {
          doc.text(`Private Duty Nurse with variable shift-based rates:`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`• Day Shift (7:00am - 7:00pm) - Monday to Friday: $35.00/hour`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`• Night Shift (7:00pm - 7:00am) - All days: $40.00/hour`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`• Day Shift (7:00am - 7:00pm) - Saturday and Sunday: $40.00/hour`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`No overtime premium applied`, 70, doc.y, { width: tableWidth, align: 'left' });
        } else {
          // Use the employeeDetails from options if available, otherwise fall back to payrollItem
          const empDetails = options.employeeDetails || {};
          const hourlyRate = parseFloat(empDetails.hourly_rate || hourlyRate || 0).toFixed(2);
          
          doc.text(`Hourly employee with rate: $${hourlyRate}/hour`, 70, doc.y, { width: tableWidth, align: 'left' });
          doc.text(`Straight pay with no overtime premium`, 70, doc.y, { width: tableWidth, align: 'left' });
        }
        
        doc.fontSize(12).font('Helvetica');
        doc.moveDown();
      }
      
      // Add deductions section
      doc.fontSize(12).font('Helvetica-Bold').text('Deductions');
      doc.moveDown(0.5);
      
      // Table header for deductions
      doc.font('Helvetica-Bold')
        .text('Description', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text('Amount', 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveTo(50, doc.y + 5)
        .lineTo(550, doc.y + 5)
        .stroke();
      doc.moveDown(0.5);
      
      // Handle both camelCase and snake_case property names for deductions
      const socialSecurityEmployee = parseFloat(payrollItem.social_security_employee || 0).toFixed(2);
      const medicalBenefitsEmployee = parseFloat( payrollItem.medical_benefits_employee || 0).toFixed(2);
      const educationLevy = parseFloat( payrollItem.education_levy || 0).toFixed(2);
      const loanDeduction = parseFloat(payrollItem.loan_deduction || 0).toFixed(2);
      const internalLoanDeduction = parseFloat( payrollItem.internal_loan_deduction || 0).toFixed(2);
      const thirdPartyDeduction = parseFloat(payrollItem.third_party_deduction || 0).toFixed(2);
      
      // Social Security
      doc.font('Helvetica')
        .text('Social Security (7%)', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${socialSecurityEmployee}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Medical Benefits
      doc.font('Helvetica')
        .text('Medical Benefits', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${medicalBenefitsEmployee}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Education Levy
      doc.font('Helvetica')
        .text('Education Levy', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${educationLevy}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Handle internal and third-party deductions separately
      
      // Internal loan deduction - shown as "Loan Repayment"
      if (parseFloat(internalLoanDeduction) > 0) {
        doc.font('Helvetica')
          .text('Loan Repayment', 50, doc.y, { width: colWidth * 2, align: 'left' })
          .text(`$${internalLoanDeduction}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      }
      
      // Third-party loan deduction - shown as "Miscellaneous Deductions"
      if (parseFloat(thirdPartyDeduction) > 0) {
        doc.font('Helvetica')
          .text('Misc. Deductions', 50, doc.y, { width: colWidth * 2, align: 'left' })
          .text(`$${thirdPartyDeduction}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      }
      
      // Add horizontal line
      doc.moveDown();
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(0.5);
      
      // Total deductions (excluding loan deduction)
      const statutoryDeductions = parseFloat(socialSecurityEmployee) + parseFloat(medicalBenefitsEmployee) + 
        parseFloat(educationLevy);
        
      // Display statutory deductions subtotal
      doc.font('Helvetica')
        .text('Statutory Deductions Subtotal', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${statutoryDeductions.toFixed(2)}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
        
      // Total including loan deduction
      const totalDeductions = statutoryDeductions + parseFloat(loanDeduction);
      doc.font('Helvetica-Bold')
        .text('Total Deductions', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${totalDeductions.toFixed(2)}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      doc.moveDown(1.5);
      
      // Net pay
      const netPay = parseFloat(payrollItem.netPay || payrollItem.net_pay || 0).toFixed(2);
      doc.font('Helvetica-Bold')
        .text('Net Pay', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${netPay}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add employer contributions section
      doc.moveDown(1.5);
      doc.fontSize(12).font('Helvetica-Bold').text('Employer Contributions');
      doc.moveDown(0.5);
      
      // Table header for employer contributions
      doc.font('Helvetica-Bold')
        .text('Description', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text('Amount', 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveTo(50, doc.y + 5)
        .lineTo(550, doc.y + 5)
        .stroke();
      doc.moveDown(0.5);
      
      // Handle both camelCase and snake_case property names for employer contributions
      const socialSecurityEmployer = parseFloat(payrollItem.socialSecurityEmployer || payrollItem.social_security_employer || 0).toFixed(2);
      const medicalBenefitsEmployer = parseFloat(payrollItem.medicalBenefitsEmployer || payrollItem.medical_benefits_employer || 0).toFixed(2);
      
      // Employer Social Security
      doc.font('Helvetica')
        .text('Social Security (9%)', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${socialSecurityEmployer}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Employer Medical Benefits
      doc.font('Helvetica')
        .text('Medical Benefits', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${medicalBenefitsEmployer}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveDown();
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(0.5);
      
      // Total employer contributions
      const totalEmployerContributions = parseFloat(socialSecurityEmployer) + parseFloat(medicalBenefitsEmployer);
      doc.font('Helvetica-Bold')
        .text('Total Employer Contributions', 50, doc.y, { width: colWidth * 2, align: 'left' })
        .text(`$${totalEmployerContributions.toFixed(2)}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      
      
      // Add loan information if present (only for internal loans)
      if (options.loanDetails && options.loanDetails.length > 0) {
        // Filter to get only internal loans
        const internalLoans = options.loanDetails.filter(loan => loan.loan_type !== 'third_party');
        
        if (internalLoans.length > 0) {
          doc.moveDown(2);
          doc.fontSize(12).font('Helvetica-Bold').text('Loan Information');
          doc.moveDown(0.5);
          
          // Loan table header
          doc.font('Helvetica-Bold')
            .text('Loan ID', 50, doc.y, { width: colWidth / 2, align: 'left' })
            .text('Payment', 50 + colWidth / 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
            .text('Remaining Balance', 50 + colWidth * 1.5, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
            .text('Status', 50 + colWidth * 2.5, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'left' });
          
          // Add horizontal line
          doc.moveTo(50, doc.y + 5)
            .lineTo(550, doc.y + 5)
            .stroke();
          doc.moveDown(0.5);
          
          // List each internal loan
          internalLoans.forEach(loan => {
            doc.font('Helvetica')
              .text(`#${loan.id}`, 50, doc.y, { width: colWidth / 2, align: 'left' })
              .text(`$${parseFloat(loan.payment || 0).toFixed(2)}`, 50 + colWidth / 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
              .text(`$${parseFloat(loan.remainingBalance).toFixed(2)}`, 50 + colWidth * 1.5, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
              .text(`${loan.status}`, 50 + colWidth * 2.5, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'left' });
          });
        }
        
        // Filter to get only third-party loans
        const thirdPartyLoans = options.loanDetails.filter(loan => loan.loan_type === 'third_party');
        
        if (thirdPartyLoans.length > 0) {
          doc.moveDown(2);
          doc.fontSize(12).font('Helvetica-Bold').text('Miscellaneous Deductions');
          doc.moveDown(0.5);
          
          // Table header for third-party deductions
          const deductionColWidth = tableWidth / 4;
          doc.font('Helvetica-Bold')
            .text('Payee', 50, doc.y, { width: deductionColWidth, align: 'left' })
            .text('Payment Amount', 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
            .text('Remaining Balance', 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
            .text('Reference', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
          
          // Add horizontal line
          doc.moveTo(50, doc.y + 5)
            .lineTo(550, doc.y + 5)
            .stroke();
          doc.moveDown(0.5);
          
          // List each third-party loan
          thirdPartyLoans.forEach(loan => {
            doc.font('Helvetica')
              .text(loan.third_party_name || 'Third-Party Institution', 50, doc.y, { width: deductionColWidth, align: 'left' })
              .text(`$${parseFloat(loan.payment || 0).toFixed(2)}`, 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(`$${parseFloat(loan.remainingBalance).toFixed(2)}`, 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(loan.third_party_reference || 'N/A', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
          });
          
          // Add note about miscellaneous deductions
          doc.moveDown();
          doc.fontSize(9).font('Helvetica-Oblique')
            .text('Note: Miscellaneous deductions represent payments made by MSA to third-party institutions on your behalf.', 
                  50, doc.y, { width: tableWidth, align: 'left' });
        }
      }
      
      // Add YTD Information Section
      doc.moveDown(2);
      doc.fontSize(12).font('Helvetica-Bold').text('Year-To-Date Summary');
      doc.moveDown(0.5);
      
      // YTD Table header
      doc.font('Helvetica-Bold')
        .text('Description', 50, doc.y, { width: colWidth, align: 'left' })
        .text('Current Period', 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text('Year-To-Date', 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveTo(50, doc.y + 5)
        .lineTo(550, doc.y + 5)
        .stroke();
      doc.moveDown(0.5);
      
      // YTD data handling (both camelCase and snake_case)
      const ytdGrossPay = parseFloat(payrollItem.ytdGrossPay || payrollItem.ytd_gross_pay || 0).toFixed(2);
      const ytdSocialSecurityEmployee = parseFloat(payrollItem.ytdSocialSecurityEmployee || payrollItem.ytd_social_security_employee || 0).toFixed(2);
      const ytdMedicalBenefitsEmployee = parseFloat(payrollItem.ytdMedicalBenefitsEmployee || payrollItem.ytd_medical_benefits_employee || 0).toFixed(2);
      const ytdEducationLevy = parseFloat(payrollItem.ytdEducationLevy || payrollItem.ytd_education_levy || 0).toFixed(2);
      // Loan functionality removed
      const ytdNetPay = parseFloat(payrollItem.ytdNetPay || payrollItem.ytd_net_pay || 0).toFixed(2);
      const ytdHoursWorked = parseFloat(payrollItem.ytdHoursWorked || payrollItem.ytd_hours_worked || 0).toFixed(2);
      
      // Gross Pay YTD
      doc.font('Helvetica')
        .text('Gross Pay', 50, doc.y, { width: colWidth, align: 'left' })
        .text(`$${grossPay}`, 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${ytdGrossPay}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Social Security YTD
      doc.font('Helvetica')
        .text('Social Security', 50, doc.y, { width: colWidth, align: 'left' })
        .text(`$${socialSecurityEmployee}`, 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${ytdSocialSecurityEmployee}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Medical Benefits YTD
      doc.font('Helvetica')
        .text('Medical Benefits', 50, doc.y, { width: colWidth, align: 'left' })
        .text(`$${medicalBenefitsEmployee}`, 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${ytdMedicalBenefitsEmployee}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Education Levy YTD
      doc.font('Helvetica')
        .text('Education Levy', 50, doc.y, { width: colWidth, align: 'left' })
        .text(`$${educationLevy}`, 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${ytdEducationLevy}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Loan functionality removed
      
      // Hours Worked YTD
      doc.font('Helvetica')
        .text('Hours Worked', 50, doc.y, { width: colWidth, align: 'left' })
        .text(hoursWorked.toString(), 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(ytdHoursWorked, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
      // Add horizontal line
      doc.moveDown();
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(0.5);
      
      // Net Pay YTD (bold)
      doc.font('Helvetica-Bold')
        .text('Net Pay', 50, doc.y, { width: colWidth, align: 'left' })
        .text(`$${netPay}`, 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${ytdNetPay}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
        
            // Add Loan Information section if internal loan deduction exists
      if (parseFloat(internalLoanDeduction) > 0 && options.loanDetails && options.loanDetails.length > 0) {
        // Filter to get only internal loans
        const internalLoans = options.loanDetails.filter(loan => loan.loan_type !== 'third_party');
        
        if (internalLoans.length > 0) {
          doc.moveDown(2);
          doc.fontSize(12).font('Helvetica-Bold').text('Loan Information');
          doc.moveDown(0.5);
          
          // Table header for loans
          const loanColWidth = tableWidth / 4;
          doc.font('Helvetica-Bold')
            .text('Loan ID', 50, doc.y, { width: loanColWidth, align: 'left' })
            .text('Payment Amount', 50 + loanColWidth, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' })
            .text('Remaining Balance', 50 + loanColWidth * 2, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' })
            .text('Expected End Date', 50 + loanColWidth * 3, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' });
          
          // Add horizontal line
          doc.moveTo(50, doc.y + 5)
            .lineTo(550, doc.y + 5)
            .stroke();
          doc.moveDown(0.5);
          
          // List each internal loan that was processed in this payroll
          internalLoans.forEach(loan => {
            doc.font('Helvetica')
              .text(`#${loan.loanId}`, 50, doc.y, { width: loanColWidth, align: 'left' })
              .text(`$${parseFloat(loan.paymentAmount).toFixed(2)}`, 50 + loanColWidth, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' })
              .text(`$${parseFloat(loan.remainingBalance).toFixed(2)}`, 50 + loanColWidth * 2, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' })
              .text(loan.expectedEndDate || 'N/A', 50 + loanColWidth * 3, doc.y - doc.currentLineHeight(), { width: loanColWidth, align: 'right' });
          });
          
          doc.moveDown();
        }
      }
      
      // Add Miscellaneous Deductions section if third-party loan deduction exists
      if (parseFloat(thirdPartyDeduction) > 0 && options.loanDetails && options.loanDetails.length > 0) {
        // Filter to get only third-party loans
        const thirdPartyLoans = options.loanDetails.filter(loan => loan.loan_type === 'third_party');
        
        if (thirdPartyLoans.length > 0) {
          doc.moveDown(2);
          doc.fontSize(12).font('Helvetica-Bold').text('Miscellaneous Deductions');
          doc.moveDown(0.5);
          
          // Table header for third-party deductions
          const deductionColWidth = tableWidth / 4;
          doc.font('Helvetica-Bold')
            .text('Payee', 50, doc.y, { width: deductionColWidth, align: 'left' })
            .text('Payment Amount', 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
            .text('Remaining Balance', 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
            .text('Reference', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
          
          // Add horizontal line
          doc.moveTo(50, doc.y + 5)
            .lineTo(550, doc.y + 5)
            .stroke();
          doc.moveDown(0.5);
          
          // List each third-party loan that was processed in this payroll
          thirdPartyLoans.forEach(loan => {
            doc.font('Helvetica')
              .text(loan.third_party_name || 'Third-Party Institution', 50, doc.y, { width: deductionColWidth, align: 'left' })
              .text(`$${parseFloat(loan.paymentAmount).toFixed(2)}`, 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(`$${parseFloat(loan.remainingBalance).toFixed(2)}`, 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(loan.third_party_reference || 'N/A', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
          });
          
          // Add note about miscellaneous deductions
          doc.moveDown();
          doc.fontSize(9).font('Helvetica-Oblique')
            .text('Note: Miscellaneous deductions represent payments made by MSA to third-party institutions on your behalf.', 
                  50, doc.y, { width: tableWidth, align: 'left' });
          
          doc.moveDown();
        }
      }
      
      // Add Miscellaneous Deductions section if third-party loan deduction exists
      if (parseFloat(thirdPartyDeduction) > 0 && options.loanDetails && options.loanDetails.length > 0) {
        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica-Bold').text('Miscellaneous Deductions');
        doc.moveDown(0.5);
        
        // Table header for third-party deductions
        const deductionColWidth = tableWidth / 4;
        doc.font('Helvetica-Bold')
          .text('Payee', 50, doc.y, { width: deductionColWidth, align: 'left' })
          .text('Payment Amount', 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
          .text('Remaining Balance', 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
          .text('Reference', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
        
        // Add horizontal line
        doc.moveTo(50, doc.y + 5)
          .lineTo(550, doc.y + 5)
          .stroke();
        doc.moveDown(0.5);
        
        // List each third-party loan that was processed in this payroll
        options.loanDetails.forEach(loan => {
          // Only show third-party loans in this section
          if (loan.loan_type === 'third_party') {
            doc.font('Helvetica')
              .text(loan.third_party_name || 'Third-Party Institution', 50, doc.y, { width: deductionColWidth, align: 'left' })
              .text(`$${parseFloat(loan.paymentAmount).toFixed(2)}`, 50 + deductionColWidth, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(`$${parseFloat(loan.remainingBalance).toFixed(2)}`, 50 + deductionColWidth * 2, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' })
              .text(loan.third_party_reference || 'N/A', 50 + deductionColWidth * 3, doc.y - doc.currentLineHeight(), { width: deductionColWidth, align: 'right' });
          }
        });
        
        // Add note about miscellaneous deductions
        doc.moveDown();
        doc.fontSize(9).font('Helvetica-Oblique')
          .text('Note: Miscellaneous deductions represent payments made by MSA to third-party institutions on your behalf.', 
                50, doc.y, { width: tableWidth, align: 'left' });
        
        doc.moveDown();
      }

      // Add Vacation Entitlement Section
      if (payrollItem.vacation_balance !== undefined || payrollItem.annual_pto_hours !== undefined) {
        doc.moveDown(2);
        doc.fontSize(12).font('Helvetica-Bold').text('Vacation Entitlement');
        doc.moveDown(0.5);
        
        const vacationBalance = parseFloat(payrollItem.vacation_balance || 0).toFixed(2);
        const annualPtoHours = parseFloat(payrollItem.annual_pto_hours || 0).toFixed(2);
        const accrualRate = parseFloat(payrollItem.accrual_rate_per_hour || 0).toFixed(6);
        
        doc.font('Helvetica')
          .text(`Annual PTO Allocation: ${annualPtoHours} hours`, 50, doc.y)
          .text(`Current Vacation Balance: ${vacationBalance} hours`, 50, doc.y)
          .text(`Accrual Rate: ${accrualRate} hours per hour worked`, 50, doc.y);
      }

      // Add footer
      doc.fontSize(8).font('Helvetica')
        .text('This is an electronic paystub and does not require a signature.', 50, 700);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 50);
      
      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generatePaystubPDF };
