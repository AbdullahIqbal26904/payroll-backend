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
      // Insert period info first
      const [periodResult] = await db.query(
        `INSERT INTO timesheet_periods (
          report_title, period_start, period_end, created_by
        ) VALUES (?, ?, ?, ?)`,
        [
          periodInfo.reportTitle,
          periodInfo.periodStart,
          periodInfo.periodEnd,
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
          (SELECT COUNT(*) FROM timesheet_entries WHERE period_id = tp.id) as entry_count
        FROM 
          timesheet_periods tp
        LEFT JOIN 
          users u ON tp.created_by = u.id
        ORDER BY 
          tp.created_at DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      return periods;
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
          u.name as created_by_name
        FROM 
          timesheet_periods tp
        LEFT JOIN 
          users u ON tp.created_by = u.id
        WHERE 
          tp.id = ?`,
        [periodId]
      );
      
      return periods[0] || null;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Timesheet;
