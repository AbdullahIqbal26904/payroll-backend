const db = require('../config/db');
const EmployeeLoan = require('./EmployeeLoan');

/**
 * @class Payroll
 * @description Payroll model for calculations and payroll management
 */
class Payroll {
  /**
   * Calculate payroll for a specific period
   * @param {number} periodId - Timesheet period ID
   * @param {Object} options - Calculation options
   * @param {number} userId - User ID performing the calculation
   * @returns {Promise<Object>} Calculation results
   */
  static async calculateForPeriod(periodId, options, userId) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get the period details first
        const [periods] = await connection.query(
          `SELECT * FROM timesheet_periods WHERE id = ?`,
          [periodId]
        );
        
        if (periods.length === 0) {
          throw new Error('Timesheet period not found');
        }
        
        const period = periods[0];
        
        // Create a new payroll calculation record
        const [payrollRun] = await connection.query(
          `INSERT INTO payroll_runs (
            period_id, 
            pay_date, 
            status, 
            created_by
          ) VALUES (?, ?, ?, ?)`,
          [
            periodId,
            options.payDate || new Date(),
            'processing',
            userId
          ]
        );
        
        const payrollRunId = payrollRun.insertId;
        
        // Get all timesheet entries for this period
        const [timesheetEntries] = await connection.query(
          `SELECT 
            te.*, 
            COALESCE(e.id, NULL) as employee_db_id
          FROM 
            timesheet_entries te
          LEFT JOIN 
            employees e ON te.employee_id = e.id
          WHERE 
            te.period_id = ?`,
          [periodId]
        );
        
        // Group entries by employee ID (primary) or name (fallback)
        const employeeHours = {};
        
        timesheetEntries.forEach(entry => {
          // Use employee_id as the primary key if available
          const key = entry.employee_id || `${entry.last_name}_${entry.first_name}`;
          
          if (!employeeHours[key]) {
            employeeHours[key] = {
              firstName: entry.first_name,
              lastName: entry.last_name,
              employeeId: entry.employee_id,
              employeeDbId: entry.employee_db_id,
              totalHours: 0,
              entries: []
            };
          }
          
          // Parse the time string to get actual hours
          const totalHours = this.parseTimeToHours(entry.total_hours);
          employeeHours[key].totalHours += totalHours;
          employeeHours[key].entries.push(entry);
        });
        
        // Get settings for calculations
        const [settings] = await connection.query('SELECT * FROM payroll_settings LIMIT 1');
        const payrollSettings = settings[0];            // Process each employee
        const payrollItems = [];
        const errors = [];
        
        for (const employeeKey in employeeHours) {
          const employee = employeeHours[employeeKey];
          
          try {
            console.log(`Processing employee: ${employee.firstName} ${employee.lastName} (ID: ${employee.employeeId}), Total Hours: ${employee.totalHours}`);
            
            // Get employee details from database if possible
            let employeeData = null;
            
            if (employee.employeeDbId) {
              const [employees] = await connection.query(
                `SELECT * FROM employees WHERE id = ?`,
                [employee.employeeDbId]
              );
              
              if (employees.length > 0) {
                employeeData = employees[0];
                console.log(`Employee data found: ${employeeData.first_name} ${employeeData.last_name}, Salary: ${employeeData.salary_amount}, Rate: ${employeeData.hourly_rate}, Frequency: ${employeeData.payment_frequency}`);
              }
            }
            // If we didn't find by database ID, try looking up by employee number
            else if (employee.employeeId) {
              const [employees] = await connection.query(
                `SELECT * FROM employees WHERE id = ?`,
                [employee.employeeId]
              );
              
              if (employees.length > 0) {
                employeeData = employees[0];
                console.log(`Employee data found by employee number: ${employeeData.first_name} ${employeeData.last_name}, Salary: ${employeeData.salary_amount}, Rate: ${employeeData.hourly_rate}, Frequency: ${employeeData.payment_frequency}`);
              }
            }
            
            // If we don't have the employee in our database, skip or create minimal record
            if (!employeeData) {
              // For now, we'll create a minimal record for reporting
              employeeData = {
                id: null,
                first_name: employee.firstName,
                last_name: employee.lastName,
                salary_amount: 0, // We don't know their salary
                payment_frequency: options.paymentFrequency || 'Bi-Weekly',
                date_of_birth: null
              };
              
              errors.push({
                message: `Employee ${employee.firstName} ${employee.lastName} not found in database, cannot calculate payroll accurately`,
                employee: `${employee.firstName} ${employee.lastName}`
              });
              
              continue; // Skip this employee since we can't calculate properly
            }
            
            // Calculate gross pay based on either hourly rate or salary
            let grossPay = 0;
            
            try {
              if (employeeData.hourly_rate && parseFloat(employeeData.hourly_rate) > 0) {
                // If hourly rate is set, calculate based on hours worked
                grossPay = employee.totalHours * parseFloat(employeeData.hourly_rate);
                console.log(`Calculated hourly pay: ${employee.totalHours} hours * ${employeeData.hourly_rate} rate = ${grossPay}`);
              } else if (employeeData.salary_amount && parseFloat(employeeData.salary_amount) > 0) {
                // If salary is set, use the salary amount based on payment frequency
                if (employeeData.payment_frequency === 'Bi-Weekly') {
                  // For bi-weekly payment, convert monthly salary to bi-weekly
                  // Assuming 26 pay periods per year (52 weeks / 2)
                  const biWeeklySalary = (parseFloat(employeeData.salary_amount) * 12) / 26;
                  grossPay = biWeeklySalary;
                } else {
                  // Monthly pay is the full salary amount
                  grossPay = parseFloat(employeeData.salary_amount);
                }
                console.log(`Using salary amount: ${employeeData.salary_amount}, payment frequency: ${employeeData.payment_frequency}, calculated: ${grossPay}`);
              }
              
              // Ensure grossPay is a valid number
              if (isNaN(grossPay)) {
                console.log(`Warning: Calculated grossPay is not a number for ${employeeData.first_name} ${employeeData.last_name}, setting to 0`);
                grossPay = 0;
              }
            } catch (calcError) {
              console.error(`Error calculating gross pay: ${calcError.message}`);
              grossPay = 0;
            }
            
            // Ensure gross pay is never negative and is properly rounded
            // First ensure grossPay is a number before using toFixed
            grossPay = typeof grossPay === 'number' ? Math.max(0, parseFloat(grossPay.toFixed(2))) : 0;
            
            // Calculate age for benefits determination
            const age = employeeData.date_of_birth 
              ? this.calculateAge(new Date(employeeData.date_of_birth)) 
              : 30; // Default age if unknown
            
            // Check if employee has any active loans
            let loanData = null;
            if (employeeData.id) {
              const activeLoans = await EmployeeLoan.getActiveLoansForEmployee(employeeData.id);
              if (activeLoans.length > 0) {
                // Use the first active loan (or we could sum multiple loans if needed)
                const activeLoan = activeLoans[0];
                loanData = {
                  id: activeLoan.id,
                  amount: Math.min(activeLoan.installment_amount, activeLoan.remaining_amount) // Don't deduct more than remaining
                };
              }
            }
            
            // Calculate deductions based on Antigua rules
            const deductions = this.calculateDeductions(grossPay, age, payrollSettings, employeeData.payment_frequency, employeeData, loanData);
            
            // Save the payroll item
            const [payrollItem] = await connection.query(
              `INSERT INTO payroll_items (
                payroll_run_id,
                employee_id,
                employee_name,
                hours_worked,
                gross_pay,
                social_security_employee,
                social_security_employer,
                medical_benefits_employee,
                medical_benefits_employer,
                education_levy,
                loan_deduction,
                total_employer_contributions,
                net_pay
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                payrollRunId,
                employeeData.id,
                `${employeeData.first_name} ${employeeData.last_name}`,
                employee.totalHours,
                grossPay,
                deductions.socialSecurityEmployee,
                deductions.socialSecurityEmployer,
                deductions.medicalBenefitsEmployee,
                deductions.medicalBenefitsEmployer,
                deductions.educationLevy,
                deductions.loanDeduction || 0,
                deductions.totalEmployerContributions,
                deductions.netPay
              ]
            );
            
            // If there's a loan, process the loan payment
            if (loanData && loanData.id && deductions.loanDeduction > 0) {
              await EmployeeLoan.processPayment(
                loanData.id, 
                payrollItem.insertId, 
                deductions.loanDeduction,
                options.payDate || new Date()
              );
            }
            
            // Add the successfully processed employee to our list
            payrollItems.push({
              id: payrollItem.insertId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              employeeId: employeeData.id,
              grossPay,
              netPay: deductions.netPay
            });
            
          } catch (error) {
            console.error(`Error processing employee ${employeeKey}:`, error);
            errors.push({
              message: `Error calculating payroll for ${employee.firstName} ${employee.lastName}: ${error.message}`,
              employee: `${employee.firstName} ${employee.lastName}`,
              error: error.message
            });
          }
        }
        
        // Update the payroll run status
        await connection.query(
          `UPDATE payroll_runs SET 
            status = ?, 
            total_employees = ?,
            total_gross = (SELECT SUM(gross_pay) FROM payroll_items WHERE payroll_run_id = ?),
            total_net = (SELECT SUM(net_pay) FROM payroll_items WHERE payroll_run_id = ?)
          WHERE id = ?`,
          [
            errors.length > 0 ? 'completed_with_errors' : 'completed',
            payrollItems.length,
            payrollRunId,
            payrollRunId,
            payrollRunId
          ]
        );
        
        await connection.commit();
        
        return {
          payrollRunId,
          periodId,
          payDate: options.payDate || new Date(),
          totalEmployees: payrollItems.length,
          payrollItems,
          errors: errors.length > 0 ? errors : null
        };
        
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Parse time string to hours
   * @param {string} timeStr - Time string in format "HH:MM" or ":MM"
   * @returns {number} Hours as decimal
   */
  static parseTimeToHours(timeStr) {
    if (!timeStr) return 0;
    
    // Handle different formats
    timeStr = timeStr.trim();
    
    if (timeStr.startsWith(':')) {
      // Format is ":MM" meaning just minutes
      const minutes = parseInt(timeStr.substring(1), 10) || 0;
      return minutes / 60;
    } else {
      // Format is "HH:MM" 
      const parts = timeStr.split(':');
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parts.length > 1 ? (parseInt(parts[1], 10) || 0) : 0;
      return hours + (minutes / 60);
    }
  }
  
  /**
   * Calculate age from date of birth
   * @param {Date} dateOfBirth - Date of birth
   * @returns {number} Age in years
   */
  static calculateAge(dateOfBirth) {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const m = today.getMonth() - dateOfBirth.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }
    
    return age;
  }
  
  /**
   * Calculate payroll deductions based on Antigua rules
   * @param {number} grossPay - Gross pay amount
   * @param {number} age - Employee age
   * @param {Object} settings - Payroll settings
   * @param {string} paymentFrequency - Payment frequency (Bi-Weekly or Monthly)
   * @param {Object} employeeData - Employee data for exemption checks
   * @param {Object} loanData - Optional loan data for this employee
   * @returns {Object} Calculated deductions
   */
  static calculateDeductions(grossPay, age, settings, paymentFrequency = 'Bi-Weekly', employeeData = null, loanData = null) {
    // Initialize deduction amounts
    let socialSecurityEmployee = 0;
    let socialSecurityEmployer = 0;
    let medicalBenefitsEmployee = 0;
    let medicalBenefitsEmployer = 0;
    let educationLevy = 0;
    let loanDeduction = 0;
    
    // 1. Social Security - 16% of gross salary (7% employee, 9% employer)
    // - Maximum monthly insurable earning is $6,500
    // - Employees above retirement age (65) are exempt
    // - Override isExemptSS can be used to exempt an employee
    if (age < settings.retirement_age && !employeeData?.is_exempt_ss) {
      // Calculate the cap based on the payment frequency
      let socialSecurityCap = settings.social_security_max_insurable;
      
      // Prorate the cap for bi-weekly payments
      if (paymentFrequency === 'Bi-Weekly') {
        // Approximate period_days/month_days * 6500
        // Assuming a bi-weekly period is ~14 days and a month is ~30 days
        socialSecurityCap = (14 / 30) * settings.social_security_max_insurable;
      }
      
      // Calculate social security based on the capped amount
      const insurable = Math.min(grossPay, socialSecurityCap);
      socialSecurityEmployee = (insurable * settings.social_security_employee_rate) / 100;
      socialSecurityEmployer = (insurable * settings.social_security_employer_rate) / 100;
    }
    
    // 2. Medical Benefits - 7% of gross salary (3.5% employee, 3.5% employer)
    // - Employees age 60-70 pay reduced rate (2.5% employee, 0% employer)
    // - Employees over 70 are exempt
    // - Override isExemptMedical can be used to exempt an employee
    if (age < settings.medical_benefits_max_age && !employeeData?.is_exempt_medical) {
      if (age < settings.medical_benefits_senior_age) {
        // Regular rate for employees under 60
        medicalBenefitsEmployee = (grossPay * settings.medical_benefits_employee_rate) / 100;
        medicalBenefitsEmployer = (grossPay * settings.medical_benefits_employer_rate) / 100;
      } else {
        // Senior rate for employees 60-70
        medicalBenefitsEmployee = (grossPay * settings.medical_benefits_employee_senior_rate) / 100;
        // Employer pays nothing for seniors
        medicalBenefitsEmployer = 0;
      }
    }
    
    // 3. Education Levy - Apply only for Monthly payments
    // - For salaries below $5,000: (gross - $541.67) * 2.5%
    // - For salaries above $5,000: [(5000 - $541.67) * 2.5%] + [(gross - 5000) * 5%]
    if (paymentFrequency === 'Monthly') {
      if (grossPay <= settings.education_levy_threshold) {
        // Apply the standard rate to amount above exemption
        const taxable = Math.max(0, grossPay - settings.education_levy_exemption);
        educationLevy = (taxable * settings.education_levy_rate) / 100;
      } else {
        // For salaries above threshold ($5,000), apply tiered calculation
        const lowerTierTaxable = settings.education_levy_threshold - settings.education_levy_exemption;
        const lowerTierLevy = (lowerTierTaxable * settings.education_levy_rate) / 100;
        
        const higherTierTaxable = grossPay - settings.education_levy_threshold;
        const higherTierLevy = (higherTierTaxable * settings.education_levy_high_rate) / 100;
        
        educationLevy = lowerTierLevy + higherTierLevy;
      }
      
      // Ensure no negative amounts
      educationLevy = Math.max(0, educationLevy);
    }
    
    // 4. Loan Deduction - If the employee has an active loan
    if (loanData && loanData.amount > 0) {
      loanDeduction = loanData.amount;
    }
    
    // Calculate net pay (gross pay minus all employee deductions)
    const totalEmployeeDeductions = socialSecurityEmployee + medicalBenefitsEmployee + educationLevy + loanDeduction;
    const totalEmployerContributions = socialSecurityEmployer + medicalBenefitsEmployer;
    const netPay = grossPay - totalEmployeeDeductions;
    
    return {
      socialSecurityEmployee,
      socialSecurityEmployer,
      medicalBenefitsEmployee,
      medicalBenefitsEmployer,
      educationLevy,
      loanDeduction,
      totalDeductions: totalEmployeeDeductions,
      totalEmployerContributions,
      netPay
    };
  }

  /**
   * Get payroll run by ID
   * @param {number} id - Payroll run ID
   * @returns {Promise<Object>} Payroll run data
   */
  static async getPayrollRunById(id) {
    try {
      // Get payroll run details
      const [runs] = await db.query(
        `SELECT 
          pr.*,
          tp.report_title,
          tp.period_start,
          tp.period_end,
          u.name as created_by_name
        FROM 
          payroll_runs pr
        JOIN 
          timesheet_periods tp ON pr.period_id = tp.id
        LEFT JOIN 
          users u ON pr.created_by = u.id
        WHERE 
          pr.id = ?`,
        [id]
      );
      
      if (runs.length === 0) {
        return null;
      }
      
      const run = runs[0];
      
      // Get payroll items
      const [items] = await db.query(
        `SELECT * FROM payroll_items WHERE payroll_run_id = ?`,
        [id]
      );
      
      return {
        ...run,
        items
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all payroll runs
   * @param {Object} options - Query options
   * @returns {Promise<Array>} All payroll runs
   */
  static async getAllPayrollRuns(options = {}) {
    try {
      const { limit = 10, offset = 0 } = options;
      
      const [runs] = await db.query(
        `SELECT 
          pr.*,
          tp.report_title,
          tp.period_start,
          tp.period_end,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM payroll_items WHERE payroll_run_id = pr.id) as item_count
        FROM 
          payroll_runs pr
        JOIN 
          timesheet_periods tp ON pr.period_id = tp.id
        LEFT JOIN 
          users u ON pr.created_by = u.id
        ORDER BY 
          pr.created_at DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      return runs;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Payroll;
