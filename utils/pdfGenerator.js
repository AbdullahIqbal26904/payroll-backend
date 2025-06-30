const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate a paystub PDF
 * @param {Object} payrollItem - Payroll item with employee and payment details
 * @param {Object} periodData - Pay period information
 * @param {Object} options - PDF generation options
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
      const employeeName = payrollItem.employeeName || payrollItem.employee_name || 'Unknown Employee';
      const employeeId = payrollItem.employeeId || payrollItem.employee_id;
      doc.text(`Name: ${employeeName}`);
      if (employeeId) {
        doc.text(`Employee ID: ${employeeId}`);
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
      
      // Regular earnings
      // Handle both camelCase and snake_case property names
      const hoursWorked = payrollItem.hoursWorked || payrollItem.hours_worked || 0;
      
      // Log data for debugging
      console.log('PDF Generation - Payroll Item:', {
        employeeName: payrollItem.employee_name || payrollItem.employeeName,
        grossPay: payrollItem.grossPay || payrollItem.gross_pay,
        hoursWorked: hoursWorked
      });
      
      const grossPay = parseFloat(payrollItem.grossPay || payrollItem.gross_pay || 0).toFixed(2);
      
      doc.font('Helvetica')
        .text('Regular Earnings', 50, doc.y, { width: colWidth, align: 'left' })
        .text(hoursWorked.toString(), 50 + colWidth, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' })
        .text(`$${grossPay}`, 50 + colWidth * 2, doc.y - doc.currentLineHeight(), { width: colWidth, align: 'right' });
      
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
      const socialSecurityEmployee = parseFloat(payrollItem.socialSecurityEmployee || payrollItem.social_security_employee || 0).toFixed(2);
      const medicalBenefitsEmployee = parseFloat(payrollItem.medicalBenefitsEmployee || payrollItem.medical_benefits_employee || 0).toFixed(2);
      const educationLevy = parseFloat(payrollItem.educationLevy || payrollItem.education_levy || 0).toFixed(2);
      
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
      
      // Add horizontal line
      doc.moveDown();
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(0.5);
      
      // Total deductions
      const totalDeductions = parseFloat(socialSecurityEmployee) + parseFloat(medicalBenefitsEmployee) + parseFloat(educationLevy);
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
