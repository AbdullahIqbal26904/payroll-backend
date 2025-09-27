const db = require('../config/db');
const EmployeeLoan = require('./EmployeeLoan');
const EmployeeVacation = require('./EmployeeVacation');
const EmployeeLeave = require('./EmployeeLeave');
const PublicHoliday = require('./PublicHoliday');

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
          const employeeInfo = employeeHours[employeeKey];
          const employeeDbId = employeeInfo.employeeDbId;
          let employeeData = null;
          
          if (employeeDbId) {
            const [employees] = await connection.query(
              `SELECT * FROM employees WHERE id = ?`,
              [employeeDbId]
            );
            if (employees.length > 0) {
              employeeData = employees[0];
            }
          }
          
          if (!employeeData) {
            // If employee not found in DB, we can't process payroll.
            errors.push({
              employeeName: employeeInfo.name,
              error: 'Employee not found in database. Cannot process payroll.'
            });
            continue;
          }
          
          console.log(`Processing employee: ${employeeData.first_name} ${employeeData.last_name} (ID: ${employeeData.id}), Total Hours: ${employeeInfo.totalHours}`);
          // Log employee data, ensuring we check both possible field names
          const salaryToLog = employeeData.salary_amount !== undefined ? employeeData.salary_amount : 
                             (employeeData.salary !== undefined ? employeeData.salary : '0.00');
          const rateToLog = employeeData.hourly_rate !== undefined ? employeeData.hourly_rate : 
                           (employeeData.rate !== undefined ? employeeData.rate : '0.00');
          console.log(`Employee data found: ${employeeData.first_name} ${employeeData.last_name}, Salary: ${salaryToLog}, Rate: ${rateToLog}, Frequency: ${employeeData.payment_frequency}`);
          
          // Get vacation entries for this employee during this period
          let vacationData = {
            vacationHours: 0,
            vacationPay: 0,
            vacationEntries: []
          };
          
          try {
            vacationData = await EmployeeVacation.calculateVacationForPeriod(
              employeeDbId, 
              period.period_start, 
              period.period_end, 
              employeeData
            );
            
            if (vacationData.vacationHours > 0) {
              console.log(`Found ${vacationData.vacationHours} vacation hours for ${employeeData.first_name} ${employeeData.last_name}`);
              console.log(`Vacation pay: $${vacationData.vacationPay}`);
            }
          } catch (vacationError) {
            console.error(`Error retrieving vacation data for employee ${employeeDbId}:`, vacationError);
            errors.push({
              employeeId: employeeDbId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              error: `Failed to process vacation data: ${vacationError.message}`
            });
          }
          
          // Get sick/maternity leave entries for this employee during this period
          let leaveData = {
            leaveHours: 0,
            leaveAmount: 0,
            leaveType: null,
            leaveEntries: []
          };
          
          try {
            leaveData = await EmployeeLeave.calculateLeaveForPeriod(
              employeeDbId, 
              period.period_start, 
              period.period_end, 
              employeeData
            );
            
            if (leaveData.leaveHours > 0) {
              console.log(`Found ${leaveData.leaveHours} ${leaveData.leaveType} leave hours for ${employeeData.first_name} ${employeeData.last_name}`);
              console.log(`Leave pay: $${leaveData.leaveAmount}`);
            }
          } catch (leaveError) {
            console.error(`Error retrieving leave data for employee ${employeeDbId}:`, leaveError);
            errors.push({
              employeeId: employeeDbId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              error: `Failed to process leave data: ${leaveError.message}`
            });
          }
          
          // Get paid public holidays for this employee during this period
          let holidayData = {
            holidayHours: 0,
            holidayPay: 0,
            holidays: []
          };
          
          try {
            holidayData = await this.calculateHolidayPayForPeriod(
              employeeDbId,
              period.period_start,
              period.period_end,
              employeeData
            );
            
            if (holidayData.holidayHours > 0) {
              console.log(`Found ${holidayData.holidayHours} holiday hours for ${employeeData.first_name} ${employeeData.last_name}`);
              console.log(`Holiday pay: $${holidayData.holidayPay}`);
              console.log(`Holidays: ${holidayData.holidays.map(h => h.name).join(', ')}`);
            }
          } catch (holidayError) {
            console.error(`Error retrieving holiday data for employee ${employeeDbId}:`, holidayError);
            errors.push({
              employeeId: employeeDbId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              error: `Failed to process holiday data: ${holidayError.message}`
            });
          }
          
          // Initialize payroll item data
          let grossPay = 0;
          let payType = 'unknown';
          
          // Determine pay type and calculate gross pay
          const employeeType = employeeData.employee_type || 'hourly';
          console.log(`Processing employee type: ${employeeType} for ${employeeData.first_name} ${employeeData.last_name}`);
          
          switch (employeeType) {
            case 'salary':
              // For salaried employees, gross pay is their salary divided by pay periods per month
              const payPeriods = employeeData.payment_frequency === 'Semi-Monthly' ? 2 : (employeeData.payment_frequency === 'Bi-Weekly' ? 2 : 1);
              // Check if we have salary_amount or just salary in the employee data
              const salaryAmount = employeeData.salary_amount !== undefined ? employeeData.salary_amount : 
                                  (employeeData.salary !== undefined ? employeeData.salary : 0);
              
              // Calculate base salary for the period
              const baseSalaryForPeriod = salaryAmount / payPeriods;
              
              // Calculate standard hours for the period based on payment frequency
              // First check if employee has custom standard hours defined
              // Fix for salary proration issue: Now calculating based on employee's actual standard hours
              // rather than using fixed values that might not match the employee's expected monthly hours
              const employeeStandardHours = employeeData.standard_hours || 40; // Default to 40 hours per week
              
              let standardHoursPerPeriod;
              if (employeeData.payment_frequency === 'Weekly') {
                standardHoursPerPeriod = employeeStandardHours; // Use employee's standard weekly hours
              } else if (employeeData.payment_frequency === 'Bi-Weekly') {
                standardHoursPerPeriod = employeeStandardHours * 2; // 2 weeks
              } else if (employeeData.payment_frequency === 'Semi-Monthly') {
                standardHoursPerPeriod = employeeStandardHours * (4.33 / 2); // Half month based on employee's weekly hours
              } else { // Monthly
                standardHoursPerPeriod = employeeStandardHours * 4; // 4 weeks per month based on employee's weekly hours
              }
              
              // Get vacation and leave hours for this employee
              const vacationHoursForPeriod = vacationData.vacationHours || 0;
              const leaveHoursForPeriod = leaveData.leaveHours || 0;
              
              // Get total hours including worked hours, vacation hours, and leave hours
              // For salaried employees, both vacation and leave hours should count as worked hours
              const totalWorkedHours = employeeInfo.totalHours + vacationHoursForPeriod + leaveHoursForPeriod;
              
              // Prorate salary based on total hours (worked + vacation) vs expected hours
              // Only prorate if total hours is less than standard hours
              if (totalWorkedHours < standardHoursPerPeriod) {
                const proratedFactor = totalWorkedHours / standardHoursPerPeriod;
                grossPay = baseSalaryForPeriod * proratedFactor;
                console.log(`Prorating salary: ${employeeInfo.totalHours} worked hours + ${vacationHoursForPeriod} vacation hours + ${leaveHoursForPeriod} leave hours = ${totalWorkedHours} total hours out of ${standardHoursPerPeriod} standard hours`);
                console.log(`Proration factor: ${proratedFactor.toFixed(4)}, Base salary: ${baseSalaryForPeriod}, Prorated salary: ${grossPay}`);
              } else {
                grossPay = baseSalaryForPeriod;
                console.log(`No proration needed: ${employeeInfo.totalHours} worked hours + ${vacationHoursForPeriod} vacation hours + ${leaveHoursForPeriod} leave hours = ${totalWorkedHours} total hours meets or exceeds ${standardHoursPerPeriod} standard hours`);
              }
              
              // For salaried employees, vacation hours are counted as worked hours
              // but don't affect gross pay (already included in salary)
              // We set vacationPay to 0 as it's already included in the salary
              vacationData.vacationPay = 0;
              
              // For leave, we need to apply the payment percentage
              // leaveAmount is already calculated with payment percentage in EmployeeLeave model
              // Add the leave amount to the gross pay for sick/maternity leave compensation
              grossPay += leaveData.leaveAmount;
              
              // Log vacation hours if any
              if (vacationData.vacationHours > 0) {
                console.log(`Salaried employee vacation: ${vacationData.vacationHours} hours (included in worked hours for proration)`);
              }
              
              // For salaried employees, holiday pay is extra (added to salary)
              grossPay += holidayData.holidayPay;
              
              // Log holiday hours if any
              if (holidayData.holidayHours > 0) {
                console.log(`Salaried employee holidays: ${holidayData.holidayHours} hours with pay $${holidayData.holidayPay}`);
                console.log(`New total with holiday pay: $${grossPay}`);
              }
              
              payType = 'salary';
              console.log(`Calculated salary pay: Base ${salaryAmount}, Holiday Pay ${holidayData.holidayPay}, Total ${grossPay}`);
              break;
              
            case 'private_duty_nurse':
              // For private duty nurses, calculate pay based on rates that vary by time of day and day of week
              let totalNursePay = 0;
              const dailyEntries = {};
              
              // Group entries by date
              employeeInfo.entries.forEach(entry => {
                // timesheet_entries uses 'work_date' column
                const dateValue = entry.work_date || entry.date;
                const entryDate = new Date(dateValue).toDateString();
                if (!dailyEntries[entryDate]) {
                  dailyEntries[entryDate] = { totalHours: 0, entries: [] };
                }
                dailyEntries[entryDate].totalHours += this.parseTimeToHours(entry.total_hours);
                dailyEntries[entryDate].entries.push(entry);
              });
              
              // Get the nurse rate settings from payroll settings
              let dayWeekdayRate = 35.00; // Default fallback value
              let nightAllRate = 40.00;   // Default fallback value
              let dayWeekendRate = 40.00; // Default fallback value
              let dayStartHour = 7;       // Default start time for day shift (7am)
              let dayEndHour = 19;        // Default end time for day shift (7pm)
              
              // Check if we have payroll settings with custom rates
              if (payrollSettings) {
                dayWeekdayRate = payrollSettings.private_duty_nurse_day_weekday || dayWeekdayRate;
                nightAllRate = payrollSettings.private_duty_nurse_night_all || nightAllRate;
                dayWeekendRate = payrollSettings.private_duty_nurse_day_weekend || dayWeekendRate;
                
                // Parse shift start/end times if available
                if (payrollSettings.private_duty_nurse_day_start) {
                  const dayStartTime = payrollSettings.private_duty_nurse_day_start;
                  dayStartHour = typeof dayStartTime === 'string' ? 
                    parseInt(dayStartTime.split(':')[0]) : dayStartHour;
                }
                
                if (payrollSettings.private_duty_nurse_day_end) {
                  const dayEndTime = payrollSettings.private_duty_nurse_day_end;
                  dayEndHour = typeof dayEndTime === 'string' ? 
                    parseInt(dayEndTime.split(':')[0]) : dayEndHour;
                }
              }
              
              // Calculate pay for each day
              for (const dateStr in dailyEntries) {
                const day = dailyEntries[dateStr];
                const date = new Date(dateStr);
                const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                
                // Determine hourly rate based on shift and day of week
                let rate;
                const timeIn = day.entries[0]?.time_in;
                const hourOfDay = timeIn ? parseInt(timeIn.split(':')[0]) : 12;
                
                const isDayShift = hourOfDay >= dayStartHour && hourOfDay < dayEndHour;
                
                if (isDayShift) {
                  // Day shift
                  rate = isWeekend ? dayWeekendRate : dayWeekdayRate;
                } else {
                  // Night shift (same rate for all days)
                  rate = nightAllRate;
                }
                
                const dailyPay = day.totalHours * rate;
                totalNursePay += dailyPay;
                console.log(`Private duty nurse pay for ${date.toLocaleDateString()}: ${day.totalHours} hours at $${rate}/hr = $${dailyPay}`);
              }
              
              // Add vacation and holiday pay for private duty nurses
              grossPay = totalNursePay + vacationData.vacationPay + leaveData.leaveAmount + holidayData.holidayPay;
              payType = 'private_duty_nurse';
              
              if (vacationData.vacationHours > 0) {
                console.log(`Private duty nurse vacation pay: ${vacationData.vacationHours} hours = $${vacationData.vacationPay}`);
              }
              
              if (leaveData.leaveHours > 0) {
                console.log(`Private duty nurse ${leaveData.leaveType} leave pay: ${leaveData.leaveHours} hours = $${leaveData.leaveAmount}`);
              }
              
              if (holidayData.holidayHours > 0) {
                console.log(`Private duty nurse holiday pay: ${holidayData.holidayHours} hours = $${holidayData.holidayPay}`);
              }
              
              console.log(`Total nurse pay including vacation and holidays: $${grossPay}`);
              break;
              
            case 'hourly':
            default:
              // For hourly employees, calculate regular and overtime hours
              const hourlyRate = employeeData.hourly_rate !== undefined ? employeeData.hourly_rate : 
                                (employeeData.rate !== undefined ? employeeData.rate : 0);
              
              // Define standard hours based on payment frequency
              let standardWeeklyHours = employeeData.standard_hours || 40; // Default to 40 hours per week
              let standardPeriodHours;
              
              // Calculate period standard hours based on payment frequency
              if (employeeData.payment_frequency === 'Weekly') {
                standardPeriodHours = standardWeeklyHours;
              } else if (employeeData.payment_frequency === 'Bi-Weekly') {
                standardPeriodHours = standardWeeklyHours * 2;
              } else if (employeeData.payment_frequency === 'Semi-Monthly') {
                // Approximately 2.167 weeks per semi-monthly period
                standardPeriodHours = standardWeeklyHours * 2.167;
              } else { // Monthly
                // Approximately 4.33 weeks per month
                standardPeriodHours = standardWeeklyHours * 4.33;
              }
              
              // Calculate regular and overtime hours - include only worked hours, not vacation
              let regularHours = Math.min(employeeInfo.totalHours, standardPeriodHours);
              let overtimeHours = Math.max(0, employeeInfo.totalHours - standardPeriodHours);
              
              // Calculate regular pay for worked hours
              const regularPay = regularHours * hourlyRate;
              const overtimePay = overtimeHours * hourlyRate * 1.5; // Overtime at 1.5x
              
              // Add vacation and holiday pay for hourly employees
              grossPay = regularPay + overtimePay + vacationData.vacationPay + leaveData.leaveAmount + holidayData.holidayPay;
              payType = 'hourly';
              
              console.log(`Using hourly rate: ${hourlyRate} for calculation`);
              console.log(`Regular hours: ${regularHours} at ${hourlyRate}/hr = ${regularPay}`);
              console.log(`Overtime hours: ${overtimeHours} at ${hourlyRate * 1.5}/hr = ${overtimePay}`);
              console.log(`Vacation hours: ${vacationData.vacationHours} with pay = ${vacationData.vacationPay}`);
              if (leaveData.leaveHours > 0) {
                console.log(`${leaveData.leaveType} leave hours: ${leaveData.leaveHours} with pay = ${leaveData.leaveAmount}`);
              }
              console.log(`Holiday hours: ${holidayData.holidayHours} with pay = ${holidayData.holidayPay}`);
              console.log(`Total hourly pay: ${grossPay} (regular + overtime + vacation + leave + holiday)`);
              break;
          }
          
          // Calculate deductions
          const age = this.calculateAge(new Date(employeeData.date_of_birth));
          const deductions = this.calculateDeductions(
            grossPay,
            age,
            payrollSettings,
            employeeData
          );
          
          // Set up variables for regular, overtime, vacation, and leave hours/pay
          let regularHours = employeeInfo.totalHours;
          let overtimeHours = 0;
          let overtimeAmount = 0;
          let leaveHours = leaveData.leaveHours || 0;
          let leaveAmount = leaveData.leaveAmount || 0;
          let leaveType = leaveData.leaveType || null;
          let vacationHours = vacationData.vacationHours || 0;
          let vacationAmount = vacationData.vacationPay || 0;
          
          // For hourly employees, use the calculated regular and overtime hours
          if (employeeType === 'hourly') {
            // Define standard hours based on payment frequency
            let standardWeeklyHours = employeeData.standard_hours || 40; // Default to 40 hours per week
            let standardPeriodHours;
            
            // Calculate period standard hours based on payment frequency
            if (employeeData.payment_frequency === 'Weekly') {
              standardPeriodHours = standardWeeklyHours;
            } else if (employeeData.payment_frequency === 'Bi-Weekly') {
              standardPeriodHours = standardWeeklyHours * 2;
            } else if (employeeData.payment_frequency === 'Semi-Monthly') {
              standardPeriodHours = standardWeeklyHours * 2.167;
            } else { // Monthly
              standardPeriodHours = standardWeeklyHours * 4.33;
            }
            
            const hourlyRate = employeeData.hourly_rate !== undefined ? employeeData.hourly_rate : 
                             (employeeData.rate !== undefined ? employeeData.rate : 0);
            
            regularHours = Math.min(employeeInfo.totalHours, standardPeriodHours);
            overtimeHours = Math.max(0, employeeInfo.totalHours - standardPeriodHours);
            overtimeAmount = overtimeHours * hourlyRate * 1.5;
          }
          
          // Insert the payroll item
          const [itemResult] = await connection.query(
            `INSERT INTO payroll_items (
              payroll_run_id, employee_id, employee_name, employee_type,
              hours_worked, regular_hours, overtime_hours, overtime_amount, 
              vacation_hours, vacation_amount, leave_hours, leave_amount, leave_type,
              holiday_hours, holiday_amount, gross_pay,
              social_security_employee, social_security_employer,
              medical_benefits_employee, medical_benefits_employer,
              education_levy, net_pay
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              payrollRunId,
              employeeDbId,
              `${employeeData.first_name} ${employeeData.last_name}`,
              employeeType,
              employeeInfo.totalHours,
              regularHours,
              overtimeHours,
              overtimeAmount,
              vacationHours,
              vacationAmount,
              leaveHours,
              leaveAmount,
              leaveType,
              holidayData.holidayHours || 0,
              holidayData.holidayPay || 0,
              grossPay,
              deductions.socialSecurityEmployee,
              deductions.socialSecurityEmployer,
              deductions.medicalBenefitsEmployee,
              deductions.medicalBenefitsEmployer,
              deductions.educationLevy,
              deductions.netPay
            ]
          );
          
          const payrollItemId = itemResult.insertId;
          
          // Process loan deductions
          let totalLoanDeduction = 0;
          let internalLoanDeduction = 0;
          let thirdPartyDeduction = 0;
          
          try {
            const activeLoans = await EmployeeLoan.getActiveLoansForEmployee(employeeDbId);
            
            if (activeLoans.length > 0) {
              console.log(`Found ${activeLoans.length} active loans for employee ${employeeDbId}`);
              
              for (const loan of activeLoans) {
                const installment = parseFloat(loan.installment_amount);
                
                // Process the payment using the existing connection
                await EmployeeLoan.processPayment(
                  loan.id,
                  payrollItemId,
                  installment,
                  options.payDate || new Date(),
                  connection // Pass the existing connection to prevent deadlocks
                );
                
                // Track deduction type
                if (loan.loan_type === 'third_party') {
                  thirdPartyDeduction += installment;
                } else {
                  internalLoanDeduction += installment;
                }
                
                totalLoanDeduction += installment;
              }
            }
          } catch (loanError) {
            console.error(`Error processing loans for employee ${employeeDbId}:`, loanError);
            errors.push({
              employeeId: employeeDbId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              error: `Failed to process loan payments: ${loanError.message}`
            });
          }
          
          // Update net pay with loan deduction
          const finalNetPay = deductions.netPay - totalLoanDeduction;
          
          await connection.query(
            `UPDATE payroll_items SET 
              net_pay = ?,
              loan_deduction = ?,
              internal_loan_deduction = ?,
              third_party_deduction = ?
            WHERE id = ?`,
            [finalNetPay, totalLoanDeduction, internalLoanDeduction, thirdPartyDeduction, payrollItemId]
          );
          
          // Calculate YTD totals for this employee up to the pay date
          const payDate = options.payDate || new Date();
          try {
            // Calculate YTD totals for the employee
            const ytdData = await this.calculateYTDTotals(employeeDbId, payDate);
            
            // Add current payroll values to YTD totals
            const updatedYtdData = {
              ytd_gross_pay: ytdData.ytd_gross_pay + grossPay,
              ytd_social_security_employee: ytdData.ytd_social_security_employee + deductions.socialSecurityEmployee,
              ytd_social_security_employer: ytdData.ytd_social_security_employer + deductions.socialSecurityEmployer,
              ytd_medical_benefits_employee: ytdData.ytd_medical_benefits_employee + deductions.medicalBenefitsEmployee,
              ytd_medical_benefits_employer: ytdData.ytd_medical_benefits_employer + deductions.medicalBenefitsEmployer,
              ytd_education_levy: ytdData.ytd_education_levy + deductions.educationLevy,
              ytd_net_pay: ytdData.ytd_net_pay + finalNetPay,
              ytd_hours_worked: ytdData.ytd_hours_worked + employeeInfo.totalHours,
              ytd_vacation_hours: (ytdData.ytd_vacation_hours || 0) + vacationHours,
              ytd_vacation_amount: (ytdData.ytd_vacation_amount || 0) + vacationAmount
            };
            
            // Update payroll item with YTD totals
            await connection.query(
              `UPDATE payroll_items SET 
                ytd_gross_pay = ?,
                ytd_social_security_employee = ?,
                ytd_social_security_employer = ?,
                ytd_medical_benefits_employee = ?,
                ytd_medical_benefits_employer = ?,
                ytd_education_levy = ?,
                ytd_net_pay = ?,
                ytd_hours_worked = ?,
                ytd_vacation_hours = ?,
                ytd_vacation_amount = ?
              WHERE id = ?`,
              [
                updatedYtdData.ytd_gross_pay,
                updatedYtdData.ytd_social_security_employee,
                updatedYtdData.ytd_social_security_employer,
                updatedYtdData.ytd_medical_benefits_employee,
                updatedYtdData.ytd_medical_benefits_employer,
                updatedYtdData.ytd_education_levy,
                updatedYtdData.ytd_net_pay,
                updatedYtdData.ytd_hours_worked,
                updatedYtdData.ytd_vacation_hours,
                updatedYtdData.ytd_vacation_amount,
                payrollItemId
              ]
            );
            
            // Update the YTD summary table
            await this.updateYTDSummary(employeeDbId, updatedYtdData, payDate.getFullYear());
            
          } catch (ytdError) {
            console.error(`Error processing YTD data for employee ${employeeDbId}:`, ytdError);
            errors.push({
              employeeId: employeeDbId,
              employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
              error: `Failed to process YTD calculations: ${ytdError.message}`
            });
          }
          
          // Add to payroll items list
          payrollItems.push({
            payrollItemId,
            employeeId: employeeDbId,
            employeeName: `${employeeData.first_name} ${employeeData.last_name}`,
            grossPay,
            netPay: finalNetPay,
            totalDeductions: deductions.totalDeductions + totalLoanDeduction,
            loanDeduction: totalLoanDeduction
          });
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
   * @param {Object} employeeData - Employee data for exemption checks and payment frequency
   * @returns {Object} Calculated deductions
   */
  static calculateDeductions(grossPay, age, settings, employeeData = null) {
    // Initialize deduction amounts
    let socialSecurityEmployee = 0;
    let socialSecurityEmployer = 0;
    let medicalBenefitsEmployee = 0;
    let medicalBenefitsEmployer = 0;
    let educationLevy = 0;
    
    // Get payment frequency from employee data or default to Bi-Weekly
    const paymentFrequency = employeeData?.payment_frequency || 'Bi-Weekly';
    
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
    
    // Calculate net pay (gross pay minus all employee deductions)
    const totalEmployeeDeductions = socialSecurityEmployee + medicalBenefitsEmployee + educationLevy;
    const totalEmployerContributions = socialSecurityEmployer + medicalBenefitsEmployer;
    const netPay = grossPay - totalEmployeeDeductions;
    
    return {
      socialSecurityEmployee,
      socialSecurityEmployer,
      medicalBenefitsEmployee,
      medicalBenefitsEmployer,
      educationLevy,
      totalDeductions: totalEmployeeDeductions,
      totalEmployerContributions,
      netPay,
      // Loan deductions will be calculated separately and are not included in totalDeductions
      loanDeduction: 0
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
          e.first_name, e.last_name, e.hire_date
        FROM payroll_items pi
        LEFT JOIN employees e ON pi.employee_id = e.id
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
   * Calculate holiday pay for an employee within a period
   * @param {string} employeeId - Employee ID
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date
   * @param {Object} employeeData - Employee data
   * @returns {Promise<Object>} Holiday hours and pay
   */
  static async calculateHolidayPayForPeriod(employeeId, startDate, endDate, employeeData) {
    try {
      // Check if holiday pay is enabled
      const holidayPayEnabled = await PublicHoliday.isHolidayPayEnabled();
      
      if (!holidayPayEnabled) {
        return { holidayHours: 0, holidayPay: 0, holidays: [] };
      }
      
      // Get holidays within the period
      const holidays = await PublicHoliday.getHolidaysInRange(startDate, endDate);
      
      if (holidays.length === 0) {
        return { holidayHours: 0, holidayPay: 0, holidays: [] };
      }
      
      // Calculate standard daily hours based on employee type and payment frequency
      let standardDailyHours = 8; // Default to 8 hours per day
      
      // For hourly employees, use standard hours / 5 (weekdays)
      if (employeeData.employee_type === 'hourly' || employeeData.employee_type === 'private_duty_nurse') {
        standardDailyHours = (employeeData.standard_hours || 40) / 5;
      } else if (employeeData.employee_type === 'salary') {
        // For salaried employees, use 8 hours per day (standard)
        standardDailyHours = 8;
      }
      
      // Calculate hourly rate for this employee
      let hourlyRate;
      
      if (employeeData.employee_type === 'salary') {
        // For salaried employees, calculate hourly rate based on monthly salary
        const monthlySalary = employeeData.salary_amount !== undefined ? 
                              employeeData.salary_amount : 
                              (employeeData.salary !== undefined ? employeeData.salary : 0);
        
        // Monthly salary / (52 weeks * 40 hours / 12 months)
        hourlyRate = (monthlySalary * 12) / (52 * 40);
      } else if (employeeData.employee_type === 'private_duty_nurse') {
        // For private duty nurses, use the day weekday rate as base rate for holidays
        hourlyRate = 35.00; // Default rate, should be overridden by settings
      } else {
        // For hourly employees, use their standard rate
        hourlyRate = employeeData.hourly_rate !== undefined ? 
                     employeeData.hourly_rate : 
                     (employeeData.rate !== undefined ? employeeData.rate : 0);
      }
      
      // Calculate holiday hours and pay
      let totalHolidayHours = 0;
      let totalHolidayPay = 0;
      
      for (const holiday of holidays) {
        totalHolidayHours += standardDailyHours;
        totalHolidayPay += standardDailyHours * hourlyRate;
      }
      
      return {
        holidayHours: totalHolidayHours,
        holidayPay: totalHolidayPay,
        holidays
      };
    } catch (error) {
      console.error('Error calculating holiday pay:', error);
      return { holidayHours: 0, holidayPay: 0, holidays: [], error: error.message };
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
          SUM(net_pay) as ytd_net_pay,
          SUM(hours_worked) as ytd_hours_worked,
          SUM(vacation_hours) as ytd_vacation_hours,
          SUM(vacation_amount) as ytd_vacation_amount,
          SUM(leave_hours) as ytd_leave_hours,
          SUM(leave_amount) as ytd_leave_amount,
          SUM(holiday_hours) as ytd_holiday_hours,
          SUM(holiday_amount) as ytd_holiday_amount
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
        ytd_net_pay: parseFloat(result.ytd_net_pay || 0),
        ytd_hours_worked: parseFloat(result.ytd_hours_worked || 0),
        ytd_vacation_hours: parseFloat(result.ytd_vacation_hours || 0),
        ytd_vacation_amount: parseFloat(result.ytd_vacation_amount || 0),
        ytd_leave_hours: parseFloat(result.ytd_leave_hours || 0),
        ytd_leave_amount: parseFloat(result.ytd_leave_amount || 0),
        ytd_holiday_hours: parseFloat(result.ytd_holiday_hours || 0),
        ytd_holiday_amount: parseFloat(result.ytd_holiday_amount || 0)
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
         ytd_medical_benefits_employer, ytd_education_levy, 
         ytd_net_pay, ytd_hours_worked, ytd_vacation_hours, ytd_vacation_amount,
         ytd_holiday_hours, ytd_holiday_amount) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        ytd_gross_pay = VALUES(ytd_gross_pay),
        ytd_social_security_employee = VALUES(ytd_social_security_employee),
        ytd_social_security_employer = VALUES(ytd_social_security_employer),
        ytd_medical_benefits_employee = VALUES(ytd_medical_benefits_employee),
        ytd_medical_benefits_employer = VALUES(ytd_medical_benefits_employer),
        ytd_education_levy = VALUES(ytd_education_levy),
        ytd_net_pay = VALUES(ytd_net_pay),
        ytd_hours_worked = VALUES(ytd_hours_worked),
        ytd_vacation_hours = VALUES(ytd_vacation_hours),
        ytd_vacation_amount = VALUES(ytd_vacation_amount),
        ytd_holiday_hours = VALUES(ytd_holiday_hours),
        ytd_holiday_amount = VALUES(ytd_holiday_amount)`,
        [
          employeeId, year,
          ytdData.ytd_gross_pay,
          ytdData.ytd_social_security_employee,
          ytdData.ytd_social_security_employer,
          ytdData.ytd_medical_benefits_employee,
          ytdData.ytd_medical_benefits_employer,
          ytdData.ytd_education_levy,
          ytdData.ytd_net_pay,
          ytdData.ytd_hours_worked,
          ytdData.ytd_vacation_hours,
          ytdData.ytd_vacation_amount,
          ytdData.ytd_holiday_hours || 0,
          ytdData.ytd_holiday_amount || 0
        ]
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate a management-focused deductions report showing employee contributions
   * @param {Object} options - Report options
   * @param {string} options.filterType - Filter type: 'all', 'range', or 'dept'
   * @param {Date} options.startDate - Start date for range filter
   * @param {Date} options.endDate - End date for range filter
   * @param {number} options.departmentId - Department ID for dept filter
   * @param {boolean} options.includeInactive - Whether to include inactive employees
   * @returns {Promise<Array>} Report data
   */
  static async generateDeductionsReport(options) {
    try {
      const { 
        filterType = 'all', 
        startDate, 
        endDate, 
        departmentId,
        includeInactive = false
      } = options;
      
      let query = `
        SELECT 
          e.id AS employee_id,
          e.first_name,
          e.last_name,
          CONCAT(e.first_name, ' ', e.last_name) AS name,
          d.name AS department,
          SUM(pi.gross_pay) AS gross_pay,
          SUM(pi.net_pay) AS net_pay,
          SUM(pi.social_security_employee) AS ss_employee,
          SUM(pi.social_security_employer) AS ss_employer,
          SUM(pi.medical_benefits_employee) AS mb_employee,
          SUM(pi.medical_benefits_employer) AS mb_employer,
          SUM(pi.education_levy) AS el_employee,
          0 AS el_employer
        FROM 
          employees e
        LEFT JOIN 
          departments d ON e.department_id = d.id
        LEFT JOIN 
          payroll_items pi ON e.id = pi.employee_id
        LEFT JOIN 
          payroll_runs pr ON pi.payroll_run_id = pr.id
        WHERE 
          pr.status IN ('completed', 'completed_with_errors', 'finalized')
      `;

      const queryParams = [];
      
      // Apply filters based on filterType
      if (filterType === 'range' && startDate && endDate) {
        query += ` AND pr.pay_date BETWEEN ? AND ?`;
        queryParams.push(startDate, endDate);
      } else if (filterType === 'dept' && departmentId) {
        query += ` AND e.department_id = ?`;
        queryParams.push(departmentId);
      }
      
      // Filter out inactive employees if specified
      if (!includeInactive) {
        query += ` AND e.status = 'active'`;
      }
      
      // Group by employee
      query += `
        GROUP BY 
          e.id, e.first_name, e.last_name, d.name
        ORDER BY 
          e.last_name, e.first_name
      `;
      
      const [rows] = await db.query(query, queryParams);
      
      // Calculate totals
      const totals = rows.reduce((acc, row) => {
        acc.gross_pay += parseFloat(row.gross_pay || 0);
        acc.net_pay += parseFloat(row.net_pay || 0);
        acc.ss_employee += parseFloat(row.ss_employee || 0);
        acc.ss_employer += parseFloat(row.ss_employer || 0);
        acc.mb_employee += parseFloat(row.mb_employee || 0);
        acc.mb_employer += parseFloat(row.mb_employer || 0);
        acc.el_employee += parseFloat(row.el_employee || 0);
        acc.el_employer += parseFloat(row.el_employer || 0);
        return acc;
      }, { 
        gross_pay: 0, 
        net_pay: 0, 
        ss_employee: 0, 
        ss_employer: 0, 
        mb_employee: 0, 
        mb_employer: 0, 
        el_employee: 0, 
        el_employer: 0 
      });
      
      // Format the rows for consistency
      const formattedRows = rows.map(row => ({
        employee_id: row.employee_id,
        name: row.name,
        department: row.department || 'Unassigned',
        gross_pay: parseFloat(row.gross_pay || 0).toFixed(1),
        net_pay: parseFloat(row.net_pay || 0).toFixed(1),
        ss_employee: parseFloat(row.ss_employee || 0).toFixed(1),
        ss_employer: parseFloat(row.ss_employer || 0).toFixed(1),
        mb_employee: parseFloat(row.mb_employee || 0).toFixed(1),
        mb_employer: parseFloat(row.mb_employer || 0).toFixed(1),
        el_employee: parseFloat(row.el_employee || 0).toFixed(1),
        el_employer: parseFloat(row.el_employer || 0).toFixed(1)
      }));
      
      return {
        rows: formattedRows,
        totals: {
          gross_pay: totals.gross_pay.toFixed(1),
          net_pay: totals.net_pay.toFixed(1),
          ss_employee: totals.ss_employee.toFixed(1),
          ss_employer: totals.ss_employer.toFixed(1),
          mb_employee: totals.mb_employee.toFixed(1),
          mb_employer: totals.mb_employer.toFixed(1),
          el_employee: totals.el_employee.toFixed(1),
          el_employer: totals.el_employer.toFixed(1)
        }
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Generate ACH report for a specific payroll run
   * @param {number} payrollRunId - Payroll run ID
   * @returns {Promise<Object>} ACH report data with banking details for direct deposits
   */
  static async generateACHReport(payrollRunId) {
    try {
      // Get the payroll run to ensure it exists and is in a valid state
      const [payrollRun] = await db.query(
        `SELECT * FROM payroll_runs WHERE id = ? AND status IN ('completed', 'completed_with_errors', 'finalized')`,
        [payrollRunId]
      );
      
      if (payrollRun.length === 0) {
        throw new Error('Payroll run not found or not in a completed state');
      }
      
      // Get payroll items with employee banking information, including city and country
      const [achData] = await db.query(
        `SELECT 
          pi.id as payroll_item_id,
          pi.employee_id,
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          pi.net_pay,
          ebi.bank_name,
          ebi.account_type,
          ebi.account_number_encrypted,
          ebi.routing_number_encrypted,
          ebi.direct_deposit_enabled,
          e.city,
          e.country
        FROM 
          payroll_items pi
        JOIN 
          employees e ON pi.employee_id = e.id
        LEFT JOIN 
          employee_banking_info ebi ON e.id = ebi.employee_id AND ebi.is_primary = TRUE AND ebi.is_active = TRUE AND ebi.direct_deposit_enabled = TRUE
        WHERE 
          pi.payroll_run_id = ?
          AND pi.net_pay > 0
        ORDER BY 
          e.last_name, e.first_name`,
        [payrollRunId]
      );
      
      // Process the data to include decrypted and masked account information
      const { decrypt } = require('../utils/encryptionUtils');
      
      // Process each record to include decrypted banking info for ACH
      const processedData = [];
      let totalAmount = 0;
      
      for (const item of achData) {
        // Skip items without banking info
        if (!item.account_number_encrypted || !item.routing_number_encrypted) {
          processedData.push({
            payroll_item_id: item.payroll_item_id,
            employee_id: item.employee_id,
            employee_name: item.employee_name,
            amount: parseFloat(item.net_pay).toFixed(2),
            bank_name: 'No banking information available',
            account_type: null,
            routing_number: null,
            account_number: null,
            institute: null,
            has_banking_info: false
          });
          continue;
        }
        
        try {
          // Decrypt the account information
          const accountNumber = decrypt(item.account_number_encrypted);
          const routingNumber = decrypt(item.routing_number_encrypted);
          
          // Convert account type to shortened format (Ck/Sv) as requested
          let shortAccountType = item.account_type;
          if (item.account_type === 'Checking') {
            shortAccountType = 'Ck';
          } else if (item.account_type === 'Savings') {
            shortAccountType = 'Sv';
          }
          
          // Format institute as "City, Country"
          const city = item.city || '';
          const country = item.country || '';
          const institute = (city && country) ? `${city}, ${country}` : (city || country || item.bank_name);
          
          processedData.push({
            payroll_item_id: item.payroll_item_id,
            employee_id: item.employee_id,
            employee_name: item.employee_name,
            amount: parseFloat(item.net_pay).toFixed(2),
            bank_name: item.bank_name,
            account_type: shortAccountType,
            routing_number: routingNumber,
            account_number: accountNumber,
            institute: institute,
            has_banking_info: true
          });
          
          totalAmount += parseFloat(item.net_pay);
        } catch (error) {
          console.error(`Error decrypting banking data for employee ${item.employee_id}:`, error);
          processedData.push({
            payroll_item_id: item.payroll_item_id,
            employee_id: item.employee_id,
            employee_name: item.employee_name,
            amount: parseFloat(item.net_pay).toFixed(2),
            bank_name: 'Error decrypting banking information',
            account_type: null,
            routing_number: null,
            account_number: null,
            institute: null,
            has_banking_info: false,
            error: 'Failed to decrypt banking information'
          });
        }
      }
      
      // Get the payroll run details
      const [runDetails] = await db.query(
        `SELECT 
          pr.*,
          tp.report_title,
          tp.period_start,
          tp.period_end
        FROM 
          payroll_runs pr
        JOIN 
          timesheet_periods tp ON pr.period_id = tp.id
        WHERE 
          pr.id = ?`,
        [payrollRunId]
      );
      
      return {
        payrollRun: runDetails[0],
        items: processedData,
        summary: {
          total_amount: totalAmount.toFixed(2),
          total_transactions: processedData.filter(item => item.has_banking_info).length,
          transactions_with_missing_info: processedData.filter(item => !item.has_banking_info).length,
        }
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Apply an override to a payroll item
   * @param {number} payrollItemId - Payroll item ID
   * @param {number} overrideAmount - The manual override amount
   * @param {string} overrideReason - Reason for the override
   * @param {number} userId - User ID applying the override
   * @returns {Promise<Object>} Updated payroll item
   */
  static async applyOverride(payrollItemId, overrideAmount, overrideReason, userId) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get the current payroll item
        const [items] = await connection.query(
          `SELECT pi.*, pr.status
           FROM payroll_items pi
           JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
           WHERE pi.id = ?`,
          [payrollItemId]
        );
        
        if (items.length === 0) {
          throw new Error('Payroll item not found');
        }
        
        const item = items[0];
        
        // Verify that the payroll run is not finalized
        if (item.status === 'finalized') {
          throw new Error('Cannot override a finalized payroll run');
        }
        
        // Calculate the new net pay based on the override amount
        const originalGrossPay = parseFloat(item.gross_pay) || 0;
        const newGrossPay = parseFloat(overrideAmount) || 0;
        
        // Calculate deductions based on the new gross pay
        // Note: We're fetching employee information to get age for deduction calculations
        let employeeAge = 0;
        let paymentFrequency = 'Bi-Weekly';  // Default
        
        if (item.employee_id) {
          // Get employee info for accurate deduction calculations
          const [employees] = await connection.query(
            `SELECT * FROM employees WHERE id = ?`,
            [item.employee_id]
          );
          
          if (employees.length > 0) {
            const employee = employees[0];
            employeeAge = employee.date_of_birth ? this.calculateAge(new Date(employee.date_of_birth)) : 0;
            paymentFrequency = employee.payment_frequency || 'Bi-Weekly';
          }
        }
        
        // Get payroll settings
        const [settings] = await connection.query('SELECT * FROM payroll_settings LIMIT 1');
        const payrollSettings = settings[0];
        
        // Calculate new deductions based on the override amount
        const newDeductions = this.calculateDeductions(
          newGrossPay,
          employeeAge,
          payrollSettings,
          { 
            is_exempt_ss: item.is_exempt_ss, 
            is_exempt_medical: item.is_exempt_medical,
            payment_frequency: paymentFrequency
          }
        );
        
        // Update the payroll item with override information
        await connection.query(
          `UPDATE payroll_items SET
            is_override = TRUE,
            override_amount = ?,
            override_reason = ?,
            override_by = ?,
            override_at = CURRENT_TIMESTAMP,
            gross_pay = ?,
            social_security_employee = ?,
            social_security_employer = ?,
            medical_benefits_employee = ?,
            medical_benefits_employer = ?,
            education_levy = ?,
            net_pay = ?
           WHERE id = ?`,
          [
            newGrossPay,
            overrideReason,
            userId,
            newGrossPay,
            newDeductions.socialSecurityEmployee,
            newDeductions.socialSecurityEmployer,
            newDeductions.medicalBenefitsEmployee,
            newDeductions.medicalBenefitsEmployer,
            newDeductions.educationLevy,
            newDeductions.netPay,
            payrollItemId
          ]
        );
        
        // Add audit trail entry for the override
        if (item.employee_id) {
          const AuditTrail = require('./AuditTrail');
          
          // Include override details in the new_values
          const newValues = { 
            gross_pay: newGrossPay, 
            net_pay: newDeductions.netPay,
            override_reason: overrideReason || 'Not provided',
            override_change: `$${originalGrossPay} → $${newGrossPay}`
          };
          
          await AuditTrail.create({
            user_id: userId,
            action: 'payroll_override',
            entity: 'payroll_item',
            entity_id: payrollItemId,
            old_values: { gross_pay: originalGrossPay, net_pay: item.net_pay },
            new_values: newValues,
            ip_address: '127.0.0.1' // Default value when called directly from the model
          });
        }
        
        // Get the updated payroll item
        const [updatedItems] = await connection.query(
          `SELECT * FROM payroll_items WHERE id = ?`,
          [payrollItemId]
        );
        
        await connection.commit();
        
        return updatedItems[0];
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
}

module.exports = Payroll;
