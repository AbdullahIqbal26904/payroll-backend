const db = require('../config/db');

/**
 * @class Timesheet
 * @description Timesheet model for managing employee time entries
 */
class Timesheet {
  /**
   * Save new time entries from CSV
   * @param {Array} entries - Array of timesheet entries
   * @param {Object} periodInfo - Period information
   * @returns {Promise} MySQL result
   */
  static async saveTimeEntries(entries, periodInfo) {
    try {
      // Derive actual date range from the entries to guard against malformed headers
      const entryDates = entries
        .map(entry => entry.date)
        .filter(dateStr => !!dateStr)
        .map(dateStr => new Date(dateStr));

      let detectedStart = null;
      let detectedEnd = null;

      if (entryDates.length > 0) {
        detectedStart = new Date(Math.min(...entryDates.map(date => date.getTime())));
        detectedEnd = new Date(Math.max(...entryDates.map(date => date.getTime())));
      }

      const detectedStartISO = detectedStart ? detectedStart.toISOString().split('T')[0] : null;
      const detectedEndISO = detectedEnd ? detectedEnd.toISOString().split('T')[0] : null;

      const headerRangeIsValid = periodInfo.periodStart && periodInfo.periodEnd &&
        detectedStartISO && detectedEndISO &&
        new Date(detectedStartISO) >= new Date(periodInfo.periodStart) &&
        new Date(detectedEndISO) <= new Date(periodInfo.periodEnd);

      const finalPeriodStart = headerRangeIsValid ? periodInfo.periodStart : (detectedStartISO || periodInfo.periodStart);
      const finalPeriodEnd = headerRangeIsValid ? periodInfo.periodEnd : (detectedEndISO || periodInfo.periodEnd);

      if (!headerRangeIsValid && detectedStartISO && detectedEndISO) {
        console.log('Overriding period range with detected dates:', finalPeriodStart, finalPeriodEnd);
      }

      // Check if a period with the same start and end dates already exists
      if (finalPeriodStart && finalPeriodEnd) {
        const [existingPeriods] = await db.query(
          `SELECT id FROM timesheet_periods 
           WHERE period_start = ? AND period_end = ?`,
          [finalPeriodStart, finalPeriodEnd]
        );
        
        if (existingPeriods.length > 0) {
          throw new Error('A timesheet for this period has already been uploaded. Cannot upload duplicate periods.');
        }
      }
      
      // Insert period info first
      const [periodResult] = await db.query(
        `INSERT INTO timesheet_periods (
          report_title, period_start, period_end, created_by
        ) VALUES (?, ?, ?, ?)`,
        [
          periodInfo.reportTitle,
          finalPeriodStart,
          finalPeriodEnd,
          periodInfo.userId
        ]
      );
      
      const periodId = periodResult.insertId;
      
      // Prepare timesheet entries for batch insert
      const values = entries.map(entry => [
        periodId,
        entry.employeeId || null,
        entry.lastName,
        entry.firstName,
        entry.date,
        entry.timeIn,
        entry.timeOut,
        entry.totalHours,
        entry.hoursDecimal || 0,
        entry.deptCode,
        entry.inLocation,
        entry.inPunchMethod,
        entry.outLocation,
        entry.outPunchMethod
      ]);
      
      // Insert all timesheet entries
      await db.query(
        `INSERT INTO timesheet_entries (
          period_id,
          employee_id,
          last_name,
          first_name,
          work_date,
          time_in,
          time_out,
          total_hours,
          hours_decimal,
          dept_code,
          in_location,
          in_punch_method,
          out_location,
          out_punch_method
        ) VALUES ?`,
        [values]
      );
      
      return periodId;
    } catch (error) {
      console.error('Error saving timesheet entries:', error);
      throw error;
    }
  }

  /**
   * Get timesheet entries by period ID
   * @param {number} periodId - Timesheet period ID
   * @returns {Promise<Array>} Timesheet entries
   */
  static async getEntriesByPeriodId(periodId) {
    try {
      const [entries] = await db.query(
        `SELECT * FROM timesheet_entries WHERE period_id = ?`,
        [periodId]
      );
      return entries;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all timesheet periods
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Timesheet periods
   */
  static async getAllPeriods(options = {}) {
    try {
      const { limit = 10, offset = 0 } = options;
      
      const [periods] = await db.query(
        `SELECT 
          tp.*,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM timesheet_entries WHERE period_id = tp.id) as entry_count,
          (SELECT COUNT(*) FROM payroll_runs 
           WHERE period_id = tp.id 
           AND (custom_period_start IS NOT NULL OR custom_period_end IS NOT NULL)) as custom_date_runs_count,
          (SELECT GROUP_CONCAT(
            CONCAT(
              'Run #', pr.id, 
              ' (', COALESCE(DATE_FORMAT(pr.custom_period_start, '%Y-%m-%d'), 'default'), 
              ' to ', COALESCE(DATE_FORMAT(pr.custom_period_end, '%Y-%m-%d'), 'default'), ')'
            ) SEPARATOR '; '
          )
          FROM payroll_runs pr
          WHERE pr.period_id = tp.id 
          AND (pr.custom_period_start IS NOT NULL OR pr.custom_period_end IS NOT NULL)) as custom_date_runs_info
        FROM 
          timesheet_periods tp
        LEFT JOIN 
          users u ON tp.created_by = u.id
        ORDER BY 
          tp.created_at DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      // Process periods to add hasCustomDateRuns flag and format the info
      const processedPeriods = periods.map(period => ({
        ...period,
        hasCustomDateRuns: period.custom_date_runs_count > 0,
        customDateRunsCount: period.custom_date_runs_count || 0,
        customDateRunsInfo: period.custom_date_runs_info || null
      }));
      
      return processedPeriods;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get timesheet period by ID
   * @param {number} periodId - Period ID
   * @returns {Promise<Object>} Timesheet period
   */
  static async getPeriodById(periodId) {
    try {
      const [periods] = await db.query(
        `SELECT 
          tp.*,
          u.name as created_by_name,
          (SELECT COUNT(*) FROM payroll_runs 
           WHERE period_id = tp.id 
           AND (custom_period_start IS NOT NULL OR custom_period_end IS NOT NULL)) as custom_date_runs_count,
          (SELECT GROUP_CONCAT(
            CONCAT(
              'Run #', pr.id, 
              ' (', COALESCE(DATE_FORMAT(pr.custom_period_start, '%Y-%m-%d'), 'default'), 
              ' to ', COALESCE(DATE_FORMAT(pr.custom_period_end, '%Y-%m-%d'), 'default'), ')'
            ) SEPARATOR '; '
          )
          FROM payroll_runs pr
          WHERE pr.period_id = tp.id 
          AND (pr.custom_period_start IS NOT NULL OR pr.custom_period_end IS NOT NULL)) as custom_date_runs_info
        FROM 
          timesheet_periods tp
        LEFT JOIN 
          users u ON tp.created_by = u.id
        WHERE 
          tp.id = ?`,
        [periodId]
      );
      
      if (periods.length === 0) {
        return null;
      }
      
      const period = periods[0];
      
      // Add processed flags
      period.hasCustomDateRuns = period.custom_date_runs_count > 0;
      period.customDateRunsCount = period.custom_date_runs_count || 0;
      period.customDateRunsInfo = period.custom_date_runs_info || null;
      
      return period;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update timesheet period status
   * @param {number} periodId - Period ID
   * @param {string} status - New status ('pending', 'processed', 'finalized')
   * @returns {Promise<Object>} Updated period
   */
  static async updatePeriodStatus(periodId, status) {
    try {
      // Validate status
      const validStatuses = ['pending', 'processed', 'finalized'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // Update the status
      await db.query(
        `UPDATE timesheet_periods 
         SET status = ?, updated_at = NOW() 
         WHERE id = ?`,
        [status, periodId]
      );

      // Return the updated period
      return await this.getPeriodById(periodId);
    } catch (error) {
      console.error('Error updating timesheet period status:', error);
      throw error;
    }
  }

  /**
   * Delete timesheet period by ID
   * @param {number} periodId - Period ID
   * @returns {Promise<Object>} Delete result with information about deleted records
   */
  static async deletePeriod(periodId) {
    try {
      // First, check if the period exists
      const period = await this.getPeriodById(periodId);
      if (!period) {
        throw new Error('Timesheet period not found');
      }

      // Get count of associated entries and payroll runs before deletion
      const [entriesCount] = await db.query(
        `SELECT COUNT(*) as count FROM timesheet_entries WHERE period_id = ?`,
        [periodId]
      );

      const [payrollRunsCount] = await db.query(
        `SELECT COUNT(*) as count FROM payroll_runs WHERE period_id = ?`,
        [periodId]
      );

      // Delete the period (CASCADE will automatically delete entries and payroll runs)
      const [result] = await db.query(
        `DELETE FROM timesheet_periods WHERE id = ?`,
        [periodId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Failed to delete timesheet period');
      }

      return {
        success: true,
        deletedPeriod: {
          id: periodId,
          periodStart: period.period_start,
          periodEnd: period.period_end,
          reportTitle: period.report_title
        },
        deletedEntriesCount: entriesCount[0].count,
        deletedPayrollRunsCount: payrollRunsCount[0].count
      };
    } catch (error) {
      console.error('Error deleting timesheet period:', error);
      throw error;
    }
  }
}

module.exports = Timesheet;
