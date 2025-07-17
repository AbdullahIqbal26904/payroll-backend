const db = require('../config/db');
const EmployeeLoan = require('./EmployeeLoan');
const VacationEntitlement = require('./VacationEntitlement');

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
            
            // Calculate gross pay based on employee type (salary vs hourly)
            let grossPay = 0;
            let regularHours = 0;
            let overtimeHours = 0;
            let overtimeAmount = 0;
            const standardHours = employeeData.standard_hours || 40; // Default to 40 hours if not set
            
            try {
              // Determine employee type (default to hourly if not specified)
              const employeeType = employeeData.employee_type || 'hourly';
              console.log(`Processing employee type: ${employeeType} for ${employeeData.first_name} ${employeeData.last_name}`);
              
              if (employeeType === 'hourly' && employeeData.hourly_rate && parseFloat(employeeData.hourly_rate) > 0) {
                // For hourly employees, simply multiply hours worked by hourly rate (no overtime)
                grossPay = employee.totalHours * parseFloat(employeeData.hourly_rate);
                regularHours = employee.totalHours;
                console.log(`Calculated hourly pay: ${employee.totalHours} hours * ${employeeData.hourly_rate} rate = ${grossPay}`);
              } 
              else if (employeeType === 'salary' && employeeData.salary_amount && parseFloat(employeeData.salary_amount) > 0) {
                // For salaried employees
                let baseSalary = 0;
                
                // Calculate base salary based on payment frequency
                if (employeeData.payment_frequency === 'Bi-Weekly') {
                  // For bi-weekly payment, convert monthly salary to bi-weekly
                  // Assuming 26 pay periods per year (52 weeks / 2)
                  baseSalary = (parseFloat(employeeData.salary_amount) * 12) / 26;
                } else if (employeeData.payment_frequency === 'Semi-Monthly') {
                  // For semi-monthly payment (twice a month), divide monthly salary by 2
                  // Assuming 24 pay periods per year (12 months * 2)
                  baseSalary = parseFloat(employeeData.salary_amount) / 2;
                } else {
                  // Monthly pay is the full salary amount
                  baseSalary = parseFloat(employeeData.salary_amount);
                }
                
                // Calculate hours worked vs standard hours
                const payPeriodStandardHours = standardHours * (employeeData.payment_frequency === 'Monthly' ? 4 : 2); // 40hrs/week * weeks in pay period
                
                if (employee.totalHours >= payPeriodStandardHours) {
                  // Employee worked standard or more hours
                  regularHours = payPeriodStandardHours;
                  
                  // Calculate overtime for hours over the standard
                  if (employee.totalHours > payPeriodStandardHours) {
                    overtimeHours = employee.totalHours - payPeriodStandardHours;
                    
                    // Calculate overtime rate: (annual_salary / 52 weeks / standard weekly hours)
                    const annualSalary = parseFloat(employeeData.salary_amount) * 12;
                    const hourlyRate = annualSalary / 52 / standardHours;
                    const overtimeRate = hourlyRate * 1.5; // 1.5x for overtime
                    
                    overtimeAmount = overtimeHours * overtimeRate;
                    console.log(`Calculated overtime: ${overtimeHours} hours at rate ${overtimeRate.toFixed(2)} = ${overtimeAmount.toFixed(2)}`);
                  }
                  
                  // Full salary plus any overtime
                  grossPay = baseSalary + overtimeAmount;
                } else {
                  // Employee worked less than standard hours - prorate the salary
                  const prorationFactor = employee.totalHours / payPeriodStandardHours;
                  regularHours = employee.totalHours;
                  grossPay = baseSalary * prorationFactor;
                  console.log(`Prorated salary: ${baseSalary} * ${prorationFactor} = ${grossPay}`);
                }
                
                console.log(`Calculated salary pay: Base ${baseSalary}, Overtime ${overtimeAmount}, Total ${grossPay}`);
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
            
            // Calculate YTD totals up to this pay date
            let ytdTotals = {
              ytd_gross_pay: 0,
              ytd_social_security_employee: 0,
              ytd_social_security_employer: 0,
              ytd_medical_benefits_employee: 0,
              ytd_medical_benefits_employer: 0,
              ytd_education_levy: 0,
              ytd_loan_deduction: 0,
              ytd_net_pay: 0,
              ytd_hours_worked: 0
            };
            
            if (employeeData.id) {
              // Get YTD totals before this payroll
              const payDate = new Date(options.payDate || new Date());
              ytdTotals = await this.calculateYTDTotals(employeeData.id, payDate);
              
              // Add current period amounts to YTD totals
              ytdTotals.ytd_gross_pay += grossPay;
              ytdTotals.ytd_social_security_employee += deductions.socialSecurityEmployee;
              ytdTotals.ytd_social_security_employer += deductions.socialSecurityEmployer;
              ytdTotals.ytd_medical_benefits_employee += deductions.medicalBenefitsEmployee;
              ytdTotals.ytd_medical_benefits_employer += deductions.medicalBenefitsEmployer;
              ytdTotals.ytd_education_levy += deductions.educationLevy;
              ytdTotals.ytd_loan_deduction += (deductions.loanDeduction || 0);
              ytdTotals.ytd_net_pay += deductions.netPay;
              ytdTotals.ytd_hours_worked += employee.totalHours;
            }
            
            // Save the payroll item with YTD totals and regular/overtime breakdowns
            const [payrollItem] = await connection.query(
              `INSERT INTO payroll_items (
                payroll_run_id,
                employee_id,
                employee_name,
                employee_type,
                hours_worked,
                regular_hours,
                overtime_hours,
                overtime_amount,
                gross_pay,
                social_security_employee,
                social_security_employer,
                medical_benefits_employee,
                medical_benefits_employer,
                education_levy,
                loan_deduction,
                total_employer_contributions,
                net_pay,
                ytd_gross_pay,
                ytd_social_security_employee,
                ytd_social_security_employer,
                ytd_medical_benefits_employee,
                ytd_medical_benefits_employer,
                ytd_education_levy,
                ytd_loan_deduction,
                ytd_net_pay,
                ytd_hours_worked
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                payrollRunId,
                employeeData.id,
                `${employeeData.first_name} ${employeeData.last_name}`,
                employeeData.employee_type || 'hourly', // Store the employee type
                employee.totalHours,
                regularHours || employee.totalHours, // Store regular hours
                overtimeHours || 0, // Store overtime hours
                overtimeAmount || 0, // Store overtime amount
                grossPay,
                deductions.socialSecurityEmployee,
                deductions.socialSecurityEmployer,
                deductions.medicalBenefitsEmployee,
                deductions.medicalBenefitsEmployer,
                deductions.educationLevy,
                deductions.loanDeduction || 0,
                deductions.totalEmployerContributions,
                deductions.netPay,
                ytdTotals.ytd_gross_pay,
                ytdTotals.ytd_social_security_employee,
                ytdTotals.ytd_social_security_employer,
                ytdTotals.ytd_medical_benefits_employee,
                ytdTotals.ytd_medical_benefits_employer,
                ytdTotals.ytd_education_levy,
                ytdTotals.ytd_loan_deduction,
                ytdTotals.ytd_net_pay,
                ytdTotals.ytd_hours_worked
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
            
            // Update vacation accrual if employee exists in database
            if (employeeData.id) {
              try {
                const payDate = new Date(options.payDate || new Date());
                const year = payDate.getFullYear();
                
                // Update vacation accrual based on hours worked
                await VacationEntitlement.updateAccrual(employeeData.id, employee.totalHours, year);
                
                // Update YTD summary table for efficient reporting
                await this.updateYTDSummary(employeeData.id, ytdTotals, year);
              } catch (vacationError) {
                console.error(`Error updating vacation accrual for employee ${employeeData.id}:`, vacationError);
                // Don't fail the entire payroll process for vacation accrual errors
              }
            }
            
            // Add the successfully processed employee to our list
            payrollItems.push({
              id: payrollItem.insertId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              employeeId: employeeData.id,
              grossPay,
              netPay: deductions.netPay,
              ytdTotals
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
      
      // Prorate the cap based on payment frequency
      if (paymentFrequency === 'Bi-Weekly') {
        // Approximate period_days/month_days * 6500
        // Assuming a bi-weekly period is ~14 days and a month is ~30 days
        socialSecurityCap = (14 / 30) * settings.social_security_max_insurable;
      } else if (paymentFrequency === 'Semi-Monthly') {
        // Semi-Monthly is exactly half of a month
        socialSecurityCap = 0.5 * settings.social_security_max_insurable;
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
    
    // 3. Education Levy - Apply for Monthly and Semi-Monthly payments
    // - For salaries below $5,000: (gross - $541.67) * 2.5%
    // - For salaries above $5,000: [(5000 - $541.67) * 2.5%] + [(gross - 5000) * 5%]
    if (paymentFrequency === 'Monthly' || paymentFrequency === 'Semi-Monthly') {
      // For Semi-Monthly, we need to adjust the thresholds
      let threshold = settings.education_levy_threshold;
      let exemption = settings.education_levy_exemption;
      
      // If Semi-Monthly, use half the monthly values
      if (paymentFrequency === 'Semi-Monthly') {
        threshold = threshold / 2;
        exemption = exemption / 2;
      } else {
        threshold = settings.education_levy_threshold;
        exemption = settings.education_levy_exemption;
      }
      if (grossPay <= threshold) {
        // Apply the standard rate to amount above exemption
        const taxable = Math.max(0, grossPay - exemption);
        educationLevy = (taxable * settings.education_levy_rate) / 100;
      } else {
        // For salaries above threshold ($5,000 or $2,500 for semi-monthly), apply tiered calculation
        const lowerTierTaxable = threshold - exemption;
        const lowerTierLevy = (lowerTierTaxable * settings.education_levy_rate) / 100;
        
        const higherTierTaxable = grossPay - threshold;
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
      
      // Get payroll items with YTD data
      const [items] = await db.query(
        `SELECT pi.*, 
          e.first_name, e.last_name, e.hire_date,
          ve.current_balance as vacation_balance,
          ve.annual_pto_hours,
          ve.accrual_rate_per_hour
        FROM payroll_items pi
        LEFT JOIN employees e ON pi.employee_id = e.id
        LEFT JOIN employee_vacation_entitlements ve ON (e.id = ve.employee_id AND ve.year = YEAR(NOW()))
        WHERE payroll_run_id = ?`,
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

  /**
   * Calculate Year-To-Date totals for an employee up to a specific date
   * @param {string} employeeId - Employee ID
   * @param {Date} upToDate - Calculate YTD up to this date
   * @returns {Promise<Object>} YTD calculations
   */
  static async calculateYTDTotals(employeeId, upToDate) {
    try {
      const year = upToDate.getFullYear();
      const startOfYear = new Date(year, 0, 1);
      
      // Get all payroll items for this employee from start of year up to the given date
      const [ytdData] = await db.query(
        `SELECT 
          SUM(gross_pay) as ytd_gross_pay,
          SUM(social_security_employee) as ytd_social_security_employee,
          SUM(social_security_employer) as ytd_social_security_employer,
          SUM(medical_benefits_employee) as ytd_medical_benefits_employee,
          SUM(medical_benefits_employer) as ytd_medical_benefits_employer,
          SUM(education_levy) as ytd_education_levy,
          SUM(loan_deduction) as ytd_loan_deduction,
          SUM(net_pay) as ytd_net_pay,
          SUM(hours_worked) as ytd_hours_worked
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE pi.employee_id = ? 
        AND pr.pay_date >= ? 
        AND pr.pay_date <= ?
        AND pr.status IN ('completed', 'completed_with_errors', 'finalized')`,
        [employeeId, startOfYear, upToDate]
      );
      
      const result = ytdData[0] || {};
      
      // Convert null values to 0 and ensure proper formatting
      return {
        ytd_gross_pay: parseFloat(result.ytd_gross_pay || 0),
        ytd_social_security_employee: parseFloat(result.ytd_social_security_employee || 0),
        ytd_social_security_employer: parseFloat(result.ytd_social_security_employer || 0),
        ytd_medical_benefits_employee: parseFloat(result.ytd_medical_benefits_employee || 0),
        ytd_medical_benefits_employer: parseFloat(result.ytd_medical_benefits_employer || 0),
        ytd_education_levy: parseFloat(result.ytd_education_levy || 0),
        ytd_loan_deduction: parseFloat(result.ytd_loan_deduction || 0),
        ytd_net_pay: parseFloat(result.ytd_net_pay || 0),
        ytd_hours_worked: parseFloat(result.ytd_hours_worked || 0)
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update YTD summary table for efficient lookups
   * @param {string} employeeId - Employee ID
   * @param {Object} ytdData - YTD data to update
   * @param {number} year - Year
   * @returns {Promise<void>}
   */
  static async updateYTDSummary(employeeId, ytdData, year) {
    try {
      await db.query(
        `INSERT INTO employee_ytd_summary 
        (employee_id, year, ytd_gross_pay, ytd_social_security_employee, 
         ytd_social_security_employer, ytd_medical_benefits_employee, 
         ytd_medical_benefits_employer, ytd_education_levy, ytd_loan_deduction, 
         ytd_net_pay, ytd_hours_worked) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        ytd_gross_pay = VALUES(ytd_gross_pay),
        ytd_social_security_employee = VALUES(ytd_social_security_employee),
        ytd_social_security_employer = VALUES(ytd_social_security_employer),
        ytd_medical_benefits_employee = VALUES(ytd_medical_benefits_employee),
        ytd_medical_benefits_employer = VALUES(ytd_medical_benefits_employer),
        ytd_education_levy = VALUES(ytd_education_levy),
        ytd_loan_deduction = VALUES(ytd_loan_deduction),
        ytd_net_pay = VALUES(ytd_net_pay),
        ytd_hours_worked = VALUES(ytd_hours_worked)`,
        [
          employeeId, year,
          ytdData.ytd_gross_pay,
          ytdData.ytd_social_security_employee,
          ytdData.ytd_social_security_employer,
          ytdData.ytd_medical_benefits_employee,
          ytdData.ytd_medical_benefits_employer,
          ytdData.ytd_education_levy,
          ytdData.ytd_loan_deduction,
          ytdData.ytd_net_pay,
          ytdData.ytd_hours_worked
        ]
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Payroll;
