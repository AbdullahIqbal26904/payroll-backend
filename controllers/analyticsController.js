const db = require('../config/db');
const Payroll = require('../models/Payroll');
const PublicHoliday = require('../models/PublicHoliday');
const EmployeeVacation = require('../models/EmployeeVacation');
const EmployeeLeave = require('../models/EmployeeLeave');
const EmployeeLoan = require('../models/EmployeeLoan');

/**
 * @class AnalyticsController
 * @description Controller for data analytics APIs to power dashboards
 */
class AnalyticsController {
  /**
   * Get payroll trend analysis over time
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} Payroll trends data
   */
  static async getPayrollTrends(req, res) {
    try {
      const { timeframe = 'monthly', startDate, endDate, departmentId } = req.query;
      
      // Validate dates
      const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
      const end = endDate ? new Date(endDate) : new Date();
      
      // SQL date format
      const formattedStart = start.toISOString().split('T')[0];
      const formattedEnd = end.toISOString().split('T')[0];
      
      // Build the GROUP BY clause based on timeframe
      let groupByClause;
      let selectTimeframe;
      
      switch (timeframe) {
        case 'weekly':
          groupByClause = 'YEARWEEK(tp.period_end, 3)';
          selectTimeframe = `CONCAT(YEAR(tp.period_end), '-W', WEEK(tp.period_end)) as time_period`;
          break;
        case 'quarterly':
          groupByClause = 'CONCAT(YEAR(tp.period_end), "-Q", QUARTER(tp.period_end))';
          selectTimeframe = `CONCAT(YEAR(tp.period_end), '-Q', QUARTER(tp.period_end)) as time_period`;
          break;
        case 'yearly':
          groupByClause = 'YEAR(tp.period_end)';
          selectTimeframe = `YEAR(tp.period_end) as time_period`;
          break;
        case 'monthly':
        default:
          groupByClause = 'DATE_FORMAT(tp.period_end, "%Y-%m")';
          selectTimeframe = `DATE_FORMAT(tp.period_end, "%Y-%m") as time_period`;
          break;
      }
      
      // Department filter condition
      const deptCondition = departmentId ? 'AND e.department_id = ?' : '';
      const queryParams = [formattedStart, formattedEnd];
      
      if (departmentId) {
        queryParams.push(departmentId);
      }
      
      // Fetch payroll trend data
      const [trends] = await db.query(
        `SELECT 
          ${selectTimeframe},
          COUNT(DISTINCT pi.employee_id) as employee_count,
          SUM(pi.gross_pay) as total_gross_pay,
          AVG(pi.gross_pay) as average_gross_pay,
          SUM(pi.net_pay) as total_net_pay,
          AVG(pi.net_pay) as average_net_pay,
          SUM(pi.regular_hours) as total_regular_hours,
          SUM(pi.overtime_hours) as total_overtime_hours,
          SUM(pi.holiday_hours) as total_holiday_hours,
          SUM(pi.vacation_hours) as total_vacation_hours,
          SUM(pi.leave_hours) as total_leave_hours,
          SUM(pi.social_security_employee + pi.medical_benefits_employee + 
              pi.education_levy + IFNULL(pi.loan_deduction, 0) + 
              IFNULL(pi.internal_loan_deduction, 0) + 
              IFNULL(pi.third_party_deduction, 0)) as total_deductions,
          SUM(pi.social_security_employer + pi.medical_benefits_employer) as total_employer_contributions
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN timesheet_periods tp ON pr.period_id = tp.id
        JOIN employees e ON pi.employee_id = e.id
        WHERE tp.period_end BETWEEN ? AND ?
        ${deptCondition}
        GROUP BY ${groupByClause}
        ORDER BY MIN(tp.period_end) ASC`,
        queryParams
      );
      
      // Calculate percentage changes between periods
      const trendsWithChanges = trends.map((period, index) => {
        if (index === 0) {
          return {
            ...period,
            gross_pay_change: 0,
            net_pay_change: 0,
            headcount_change: 0
          };
        }
        
        const prevPeriod = trends[index - 1];
        
        // Calculate percentage changes
        const grossPayChange = prevPeriod.total_gross_pay !== 0 
          ? ((period.total_gross_pay - prevPeriod.total_gross_pay) / prevPeriod.total_gross_pay) * 100
          : 0;
          
        const netPayChange = prevPeriod.total_net_pay !== 0
          ? ((period.total_net_pay - prevPeriod.total_net_pay) / prevPeriod.total_net_pay) * 100
          : 0;
          
        const headcountChange = prevPeriod.employee_count !== 0
          ? ((period.employee_count - prevPeriod.employee_count) / prevPeriod.employee_count) * 100
          : 0;
        
        return {
          ...period,
          gross_pay_change: parseFloat(grossPayChange.toFixed(2)),
          net_pay_change: parseFloat(netPayChange.toFixed(2)),
          headcount_change: parseFloat(headcountChange.toFixed(2))
        };
      });
      
      // Get summary stats
      const summary = {
        total_periods: trends.length,
        average_gross_pay_all_periods: trends.length > 0 
          ? parseFloat((trends.reduce((sum, p) => sum + parseFloat(p.total_gross_pay), 0) / trends.length).toFixed(2))
          : 0,
        average_headcount: trends.length > 0
          ? Math.round(trends.reduce((sum, p) => sum + parseInt(p.employee_count), 0) / trends.length)
          : 0,
        total_gross_pay: trends.length > 0
          ? parseFloat(trends.reduce((sum, p) => sum + parseFloat(p.total_gross_pay), 0).toFixed(2))
          : 0
      };
      
      res.status(200).json({
        success: true,
        data: {
          trends: trendsWithChanges,
          summary,
          timeframe,
          period: {
            start: formattedStart,
            end: formattedEnd
          }
        }
      });
    } catch (error) {
      console.error('Error in getPayrollTrends:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve payroll trend data',
        error: error.message
      });
    }
  }

  /**
   * Get employee-related analytics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} Employee analytics data
   */
  static async getEmployeeAnalytics(req, res) {
    try {
      const { asOfDate } = req.query;
      const referenceDate = asOfDate ? new Date(asOfDate) : new Date();
      const formattedDate = referenceDate.toISOString().split('T')[0];
      
      const connection = await db.getConnection();
      try {
        // Employee headcount by department
        const [deptHeadcount] = await connection.query(
          `SELECT 
            d.name as department_name, 
            COUNT(*) as employee_count,
            SUM(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) as active_count,
            SUM(CASE WHEN e.status != 'active' THEN 1 ELSE 0 END) as inactive_count
          FROM employees e
          LEFT JOIN departments d ON e.department_id = d.id
          WHERE e.hire_date <= ?
          GROUP BY e.department_id
          ORDER BY employee_count DESC`,
          [formattedDate]
        );
        
        // Employee count by type
        const [employeeTypes] = await connection.query(
          `SELECT 
            employee_type, 
            COUNT(*) as count,
            ROUND((COUNT(*) / (SELECT COUNT(*) FROM employees WHERE status = 'active')) * 100, 2) as percentage
          FROM employees
          WHERE status = 'active'
          GROUP BY employee_type
          ORDER BY count DESC`
        );
        
        // New hires over time (last 12 months)
        const [newHires] = await connection.query(
          `SELECT 
            DATE_FORMAT(hire_date, '%Y-%m') as month,
            COUNT(*) as hire_count
          FROM employees
          WHERE hire_date >= DATE_SUB(?, INTERVAL 12 MONTH)
          GROUP BY DATE_FORMAT(hire_date, '%Y-%m')
          ORDER BY month ASC`,
          [formattedDate]
        );
        
        // Employee tenure distribution
        const [tenureDistribution] = await connection.query(
          `SELECT
            CASE 
              WHEN DATEDIFF(?, hire_date) / 365 < 1 THEN 'Less than 1 year'
              WHEN DATEDIFF(?, hire_date) / 365 < 2 THEN '1-2 years'
              WHEN DATEDIFF(?, hire_date) / 365 < 5 THEN '2-5 years'
              WHEN DATEDIFF(?, hire_date) / 365 < 10 THEN '5-10 years'
              ELSE 'Over 10 years'
            END as tenure_group,
            COUNT(*) as employee_count,
            ROUND(AVG(DATEDIFF(?, hire_date) / 365), 1) as avg_years
          FROM employees
          WHERE status = 'active'
          GROUP BY tenure_group
          ORDER BY MIN(DATEDIFF(?, hire_date))`,
          [formattedDate, formattedDate, formattedDate, formattedDate, formattedDate, formattedDate]
        );
        
        // Salary distribution
        const [salaryDistribution] = await connection.query(
          `SELECT
            CASE 
              WHEN salary_amount = 0 THEN 'Hourly employees'
              WHEN salary_amount < 30000 THEN 'Under $30K'
              WHEN salary_amount < 50000 THEN '$30K-$50K'
              WHEN salary_amount < 75000 THEN '$50K-$75K'
              WHEN salary_amount < 100000 THEN '$75K-$100K'
              ELSE 'Over $100K'
            END as salary_range,
            COUNT(*) as employee_count,
            ROUND(AVG(CASE WHEN salary_amount > 0 THEN salary_amount ELSE NULL END), 2) as avg_salary
          FROM employees
          WHERE status = 'active'
          GROUP BY salary_range
          ORDER BY MIN(salary_amount)`,
        );
        
        res.status(200).json({
          success: true,
          data: {
            department_distribution: deptHeadcount,
            employee_types: employeeTypes,
            new_hires_trend: newHires,
            tenure_distribution: tenureDistribution,
            salary_distribution: salaryDistribution,
            as_of_date: formattedDate
          }
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error in getEmployeeAnalytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve employee analytics data',
        error: error.message
      });
    }
  }

  /**
   * Get deductions analytics over time
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} Deductions analytics data
   */
  static async getDeductionsAnalytics(req, res) {
    try {
      const { timeframe = 'monthly', startDate, endDate, departmentId } = req.query;
      
      // Validate dates
      const start = startDate ? new Date(startDate) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
      const end = endDate ? new Date(endDate) : new Date();
      
      // SQL date format
      const formattedStart = start.toISOString().split('T')[0];
      const formattedEnd = end.toISOString().split('T')[0];
      
      // Build the GROUP BY clause based on timeframe
      let groupByClause;
      let selectTimeframe;
      
      switch (timeframe) {
        case 'weekly':
          groupByClause = 'YEARWEEK(tp.period_end, 3)';
          selectTimeframe = `CONCAT(YEAR(tp.period_end), '-W', WEEK(tp.period_end)) as time_period`;
          break;
        case 'quarterly':
          groupByClause = 'CONCAT(YEAR(tp.period_end), "-Q", QUARTER(tp.period_end))';
          selectTimeframe = `CONCAT(YEAR(tp.period_end), '-Q', QUARTER(tp.period_end)) as time_period`;
          break;
        case 'yearly':
          groupByClause = 'YEAR(tp.period_end)';
          selectTimeframe = `YEAR(tp.period_end) as time_period`;
          break;
        case 'monthly':
        default:
          groupByClause = 'DATE_FORMAT(tp.period_end, "%Y-%m")';
          selectTimeframe = `DATE_FORMAT(tp.period_end, "%Y-%m") as time_period`;
          break;
      }
      
      // Department filter condition
      const deptCondition = departmentId ? 'AND e.department_id = ?' : '';
      const queryParams = [formattedStart, formattedEnd];
      
      if (departmentId) {
        queryParams.push(departmentId);
      }
      
        // Fetch deductions data
      const [deductionTrends] = await db.query(
        `SELECT 
          ${selectTimeframe},
          SUM(pi.social_security_employee) as total_social_security_employee,
          SUM(pi.social_security_employer) as total_social_security_employer,
          SUM(pi.medical_benefits_employee) as total_medical_benefits_employee,
          SUM(pi.medical_benefits_employer) as total_medical_benefits_employer,
          SUM(pi.education_levy) as total_education_levy,
          SUM(pi.loan_deduction) as total_loan_deductions,
          SUM(pi.internal_loan_deduction) as total_internal_loan_deductions,
          SUM(pi.third_party_deduction) as total_third_party_deductions,
          SUM(pi.social_security_employee + pi.medical_benefits_employee + 
              pi.education_levy + IFNULL(pi.loan_deduction, 0) + 
              IFNULL(pi.internal_loan_deduction, 0) + 
              IFNULL(pi.third_party_deduction, 0)) as total_deductions,
          SUM(pi.social_security_employer + pi.medical_benefits_employer) as total_employer_contributions,
          COUNT(DISTINCT pi.employee_id) as employee_count
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN timesheet_periods tp ON pr.period_id = tp.id
        JOIN employees e ON pi.employee_id = e.id
        WHERE tp.period_end BETWEEN ? AND ?
        ${deptCondition}
        GROUP BY ${groupByClause}
        ORDER BY MIN(tp.period_end) ASC`,
        queryParams
      );      // Calculate per-employee averages for each period
      const trendsWithAverages = deductionTrends.map(period => {
        return {
          ...period,
          avg_social_security_employee: period.employee_count > 0 ? 
            parseFloat((period.total_social_security_employee / period.employee_count).toFixed(2)) : 0,
          avg_medical_benefits_employee: period.employee_count > 0 ? 
            parseFloat((period.total_medical_benefits_employee / period.employee_count).toFixed(2)) : 0,
          avg_education_levy: period.employee_count > 0 ? 
            parseFloat((period.total_education_levy / period.employee_count).toFixed(2)) : 0,
          avg_loan_deductions: period.employee_count > 0 ? 
            parseFloat((period.total_loan_deductions / period.employee_count).toFixed(2)) : 0,
          avg_total_deductions: period.employee_count > 0 ? 
            parseFloat((period.total_deductions / period.employee_count).toFixed(2)) : 0
        };
      });
      
      // Get deduction type distribution (current)
      const deductionTypes = trendsWithAverages.reduce((total, period) => {
        return {
          social_security_employee: total.social_security_employee + parseFloat(period.total_social_security_employee || 0),
          social_security_employer: total.social_security_employer + parseFloat(period.total_social_security_employer || 0),
          medical_benefits_employee: total.medical_benefits_employee + parseFloat(period.total_medical_benefits_employee || 0),
          medical_benefits_employer: total.medical_benefits_employer + parseFloat(period.total_medical_benefits_employer || 0),
          education_levy: total.education_levy + parseFloat(period.total_education_levy || 0),
          loan_deductions: total.loan_deductions + parseFloat(period.total_loan_deductions || 0)
        };
      }, {
        social_security_employee: 0,
        social_security_employer: 0,
        medical_benefits_employee: 0,
        medical_benefits_employer: 0,
        education_levy: 0,
        loan_deductions: 0
      });
      
      // Calculate totals and percentages
      const totalDeductions = Object.values(deductionTypes).reduce((sum, val) => sum + val, 0);
      const deductionDistribution = Object.entries(deductionTypes).map(([key, value]) => ({
        deduction_type: key,
        amount: parseFloat(value.toFixed(2)),
        percentage: totalDeductions > 0 ? parseFloat(((value / totalDeductions) * 100).toFixed(2)) : 0
      }));
      
      res.status(200).json({
        success: true,
        data: {
          trends: trendsWithAverages,
          distribution: deductionDistribution,
          total_deductions: parseFloat(totalDeductions.toFixed(2)),
          timeframe,
          period: {
            start: formattedStart,
            end: formattedEnd
          }
        }
      });
    } catch (error) {
      console.error('Error in getDeductionsAnalytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve deductions analytics data',
        error: error.message
      });
    }
  }

  /**
   * Get leave and holiday analytics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} Leave and holiday analytics data
   */
  static async getLeaveHolidayAnalytics(req, res) {
    try {
      const { year = new Date().getFullYear(), departmentId } = req.query;
      
      const connection = await db.getConnection();
      try {
        // Department filter condition
        const deptCondition = departmentId ? 'AND e.department_id = ?' : '';
        const queryParams = [year];
        
        if (departmentId) {
          queryParams.push(departmentId);
        }
        
        // Holiday usage over the year
        const [holidayUsage] = await connection.query(
          `SELECT 
            MONTH(tp.period_end) as month,
            SUM(pi.holiday_hours) as total_holiday_hours,
            SUM(pi.holiday_amount) as total_holiday_pay,
            COUNT(DISTINCT CASE WHEN pi.holiday_hours > 0 THEN pi.employee_id END) as employee_count
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          JOIN employees e ON pi.employee_id = e.id
          WHERE YEAR(tp.period_end) = ?
          ${deptCondition}
          GROUP BY MONTH(tp.period_end)
          ORDER BY month ASC`,
          queryParams
        );
        
        // Leave usage by type
        const [leaveUsage] = await connection.query(
          `SELECT 
            MONTH(tp.period_end) as month,
            SUM(pi.leave_hours) as total_leave_hours,
            SUM(pi.leave_amount) as total_leave_pay,
            COUNT(DISTINCT CASE WHEN pi.leave_hours > 0 THEN pi.employee_id END) as employee_count,
            pi.leave_type
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          JOIN employees e ON pi.employee_id = e.id
          WHERE YEAR(tp.period_end) = ?
          ${deptCondition}
          AND pi.leave_type IS NOT NULL
          GROUP BY MONTH(tp.period_end), pi.leave_type
          ORDER BY month ASC, pi.leave_type`,
          queryParams
        );
        
        // Vacation usage over the year
        const [vacationUsage] = await connection.query(
          `SELECT 
            MONTH(tp.period_end) as month,
            SUM(pi.vacation_hours) as total_vacation_hours,
            SUM(pi.vacation_amount) as total_vacation_pay,
            COUNT(DISTINCT CASE WHEN pi.vacation_hours > 0 THEN pi.employee_id END) as employee_count
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          JOIN employees e ON pi.employee_id = e.id
          WHERE YEAR(tp.period_end) = ?
          ${deptCondition}
          GROUP BY MONTH(tp.period_end)
          ORDER BY month ASC`,
          queryParams
        );
        
        // Leave type distribution for the year
        const [leaveDistribution] = await connection.query(
          `SELECT 
            leave_type,
            SUM(leave_hours) as total_hours,
            SUM(leave_amount) as total_amount,
            COUNT(DISTINCT employee_id) as employee_count
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          JOIN employees e ON pi.employee_id = e.id
          WHERE YEAR(tp.period_end) = ?
          ${deptCondition}
          AND leave_type IS NOT NULL
          GROUP BY leave_type
          ORDER BY total_hours DESC`,
          queryParams
        );
        
        // Convert month numbers to names for better readability
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        
        const formatMonthData = (data) => {
          return data.map(item => ({
            ...item,
            month_name: monthNames[item.month - 1]
          }));
        };
        
        // Fill in missing months with zero values for holiday usage
        const completeHolidayData = Array.from({ length: 12 }, (_, i) => {
          const existingData = holidayUsage.find(item => item.month === i + 1);
          return existingData || {
            month: i + 1,
            month_name: monthNames[i],
            total_holiday_hours: 0,
            total_holiday_pay: 0,
            employee_count: 0
          };
        });
        
        // Fill in missing months with zero values for vacation usage
        const completeVacationData = Array.from({ length: 12 }, (_, i) => {
          const existingData = vacationUsage.find(item => item.month === i + 1);
          return existingData || {
            month: i + 1,
            month_name: monthNames[i],
            total_vacation_hours: 0,
            total_vacation_pay: 0,
            employee_count: 0
          };
        });
        
        res.status(200).json({
          success: true,
          data: {
            holiday_usage: formatMonthData(completeHolidayData),
            leave_usage: formatMonthData(leaveUsage),
            vacation_usage: formatMonthData(completeVacationData),
            leave_distribution: leaveDistribution,
            year
          }
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error in getLeaveHolidayAnalytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve leave and holiday analytics data',
        error: error.message
      });
    }
  }
  
  /**
   * Get dashboard summary metrics
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @returns {Object} Dashboard summary data
   */
  static async getDashboardSummary(req, res) {
    try {
      // Get current date and first day of current month
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
      
      const connection = await db.getConnection();
      
      try {
        // Get active employee count
        const [employeeCount] = await connection.query(
          `SELECT COUNT(*) as total, 
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
          FROM employees`
        );
        
        // Get department count
        const [deptCount] = await connection.query(
          'SELECT COUNT(*) as total FROM departments'
        );
        
        // Get total payroll for current month
        const [currentMonthPayroll] = await connection.query(
          `SELECT 
            SUM(pi.gross_pay) as total_gross_pay,
            SUM(pi.net_pay) as total_net_pay
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          WHERE tp.period_end >= ?`,
          [firstDayOfMonth.toISOString().split('T')[0]]
        );
        
        // Get YTD payroll
        const firstDayOfYear = new Date(currentYear, 0, 1);
        const [ytdPayroll] = await connection.query(
          `SELECT 
            SUM(pi.gross_pay) as ytd_gross_pay,
            SUM(pi.net_pay) as ytd_net_pay,
            SUM(pi.social_security_employee + pi.medical_benefits_employee + 
                pi.education_levy + IFNULL(pi.loan_deduction, 0) + 
                IFNULL(pi.internal_loan_deduction, 0) + 
                IFNULL(pi.third_party_deduction, 0)) as ytd_deductions,
            SUM(pi.social_security_employer + pi.medical_benefits_employer) as ytd_employer_contributions
          FROM payroll_items pi
          JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          WHERE tp.period_end >= ?`,
          [firstDayOfYear.toISOString().split('T')[0]]
        );
        
        // Get upcoming holidays (next 30 days)
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
        
        const [upcomingHolidays] = await connection.query(
          `SELECT * FROM public_holidays
          WHERE date BETWEEN CURDATE() AND ?
          ORDER BY date ASC
          LIMIT 5`,
          [thirtyDaysLater.toISOString().split('T')[0]]
        );
        
        // Get recent payroll runs
        const [recentPayrolls] = await connection.query(
          `SELECT 
            pr.id, 
            tp.report_title as description, 
            tp.period_start, 
            tp.period_end, 
            pr.pay_date,
            COUNT(DISTINCT pi.employee_id) as employee_count,
            SUM(pi.gross_pay) as total_gross_pay,
            SUM(pi.net_pay) as total_net_pay
          FROM payroll_runs pr
          JOIN payroll_items pi ON pr.id = pi.payroll_run_id
          JOIN timesheet_periods tp ON pr.period_id = tp.id
          GROUP BY pr.id
          ORDER BY pr.pay_date DESC
          LIMIT 5`
        );
        
        // Get employees on leave today
        const [employeesOnLeave] = await connection.query(
          `SELECT 
            el.id,
            el.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            el.start_date,
            el.end_date,
            el.leave_type,
            d.name as department
          FROM employee_leaves el
          JOIN employees e ON el.employee_id = e.id
          LEFT JOIN departments d ON e.department_id = d.id
          WHERE el.status = 'approved'
          AND CURDATE() BETWEEN el.start_date AND el.end_date
          ORDER BY el.start_date ASC`
        );
        
        // Get employees on vacation today
        const [employeesOnVacation] = await connection.query(
          `SELECT 
            ev.id,
            ev.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            ev.start_date,
            ev.end_date,
            d.name as department
          FROM employee_vacations ev
          JOIN employees e ON ev.employee_id = e.id
          LEFT JOIN departments d ON e.department_id = d.id
          WHERE ev.status = 'approved'
          AND CURDATE() BETWEEN ev.start_date AND ev.end_date
          ORDER BY ev.start_date ASC`
        );
        
        // Format the summary data
        const dashboardSummary = {
          employees: {
            total: employeeCount[0].total,
            active: employeeCount[0].active,
            on_leave: employeesOnLeave.length,
            on_vacation: employeesOnVacation.length
          },
          departments: deptCount[0].total,
          current_month_payroll: {
            gross_pay: parseFloat(currentMonthPayroll[0].total_gross_pay || 0),
            net_pay: parseFloat(currentMonthPayroll[0].total_net_pay || 0)
          },
          ytd_payroll: {
            gross_pay: parseFloat(ytdPayroll[0].ytd_gross_pay || 0),
            net_pay: parseFloat(ytdPayroll[0].ytd_net_pay || 0),
            total_deductions: parseFloat(ytdPayroll[0].ytd_deductions || 0),
            employer_contributions: parseFloat(ytdPayroll[0].ytd_employer_contributions || 0)
          },
          upcoming_holidays: upcomingHolidays,
          recent_payrolls: recentPayrolls,
          employees_on_leave: employeesOnLeave,
          employees_on_vacation: employeesOnVacation,
          as_of_date: today.toISOString().split('T')[0]
        };
        
        res.status(200).json({
          success: true,
          data: dashboardSummary
        });
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error in getDashboardSummary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard summary data',
        error: error.message
      });
    }
  }
}

module.exports = AnalyticsController;