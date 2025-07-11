const db = require('../config/db');

/**
 * @class VacationEntitlement
 * @description Vacation entitlement model for managing employee vacation accruals and requests
 */
class VacationEntitlement {
  
  /**
   * Initialize vacation entitlement for an employee for a specific year
   * @param {string} employeeId - Employee ID
   * @param {number} year - Year to initialize
   * @param {number} annualPtoHours - Annual PTO hours allocated
   * @returns {Promise<Object>} Created entitlement
   */
  static async initializeEntitlement(employeeId, year, annualPtoHours) {
    try {
      // Calculate accrual rate per hour (assuming 2080 total work hours per year)
      const totalAnnualWorkHours = 2080;
      const accrualRatePerHour = annualPtoHours / totalAnnualWorkHours;
      
      const [result] = await db.query(
        `INSERT INTO employee_vacation_entitlements 
        (employee_id, annual_pto_hours, accrual_rate_per_hour, current_balance, year) 
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
        annual_pto_hours = VALUES(annual_pto_hours),
        accrual_rate_per_hour = VALUES(accrual_rate_per_hour)`,
        [employeeId, annualPtoHours, accrualRatePerHour, 0, year]
      );
      
      return this.getEntitlementByEmployeeAndYear(employeeId, year);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation entitlement for an employee for a specific year
   * @param {string} employeeId - Employee ID
   * @param {number} year - Year
   * @returns {Promise<Object>} Vacation entitlement
   */
  static async getEntitlementByEmployeeAndYear(employeeId, year) {
    try {
      const [entitlements] = await db.query(
        `SELECT * FROM employee_vacation_entitlements 
        WHERE employee_id = ? AND year = ?`,
        [employeeId, year]
      );
      
      return entitlements[0] || null;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update vacation accrual based on hours worked
   * @param {string} employeeId - Employee ID
   * @param {number} hoursWorked - Hours worked in the pay period
   * @param {number} year - Year
   * @returns {Promise<Object>} Updated entitlement
   */
  static async updateAccrual(employeeId, hoursWorked, year) {
    try {
      // Get current entitlement
      let entitlement = await this.getEntitlementByEmployeeAndYear(employeeId, year);
      
      if (!entitlement) {
        // Initialize with default 80 hours (2 weeks) if not found
        entitlement = await this.initializeEntitlement(employeeId, year, 80);
      }
      
      // Calculate additional earned hours
      const additionalEarned = hoursWorked * entitlement.accrual_rate_per_hour;
      
      // Update the entitlement
      await db.query(
        `UPDATE employee_vacation_entitlements 
        SET 
          total_earned_current_year = total_earned_current_year + ?,
          current_balance = current_balance + ?
        WHERE employee_id = ? AND year = ?`,
        [additionalEarned, additionalEarned, employeeId, year]
      );
      
      return this.getEntitlementByEmployeeAndYear(employeeId, year);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Create a vacation request
   * @param {Object} requestData - Vacation request data
   * @returns {Promise<Object>} Created vacation request
   */
  static async createVacationRequest(requestData) {
    try {
      const { employeeId, startDate, endDate, totalHours, notes } = requestData;
      
      const [result] = await db.query(
        `INSERT INTO vacation_requests 
        (employee_id, start_date, end_date, total_hours, notes) 
        VALUES (?, ?, ?, ?, ?)`,
        [employeeId, startDate, endDate, totalHours, notes]
      );
      
      return this.getVacationRequestById(result.insertId);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation request by ID
   * @param {number} requestId - Request ID
   * @returns {Promise<Object>} Vacation request
   */
  static async getVacationRequestById(requestId) {
    try {
      const [requests] = await db.query(
        `SELECT vr.*, 
          e.first_name, e.last_name,
          u.name as approved_by_name
        FROM vacation_requests vr
        LEFT JOIN employees e ON vr.employee_id = e.id
        LEFT JOIN users u ON vr.approved_by = u.id
        WHERE vr.id = ?`,
        [requestId]
      );
      
      return requests[0] || null;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation requests for an employee
   * @param {string} employeeId - Employee ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Vacation requests
   */
  static async getVacationRequestsByEmployee(employeeId, options = {}) {
    try {
      const { limit = 10, offset = 0, status = null } = options;
      
      let query = `
        SELECT vr.*, 
          e.first_name, e.last_name,
          u.name as approved_by_name
        FROM vacation_requests vr
        LEFT JOIN employees e ON vr.employee_id = e.id
        LEFT JOIN users u ON vr.approved_by = u.id
        WHERE vr.employee_id = ?
      `;
      
      const params = [employeeId];
      
      if (status) {
        query += ' AND vr.status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY vr.request_date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const [requests] = await db.query(query, params);
      
      return requests;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Approve or deny a vacation request
   * @param {number} requestId - Request ID
   * @param {string} status - New status ('approved' or 'denied')
   * @param {number} approvedBy - User ID of approver
   * @returns {Promise<Object>} Updated request
   */
  static async updateVacationRequestStatus(requestId, status, approvedBy) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get the request details
        const [requests] = await connection.query(
          'SELECT * FROM vacation_requests WHERE id = ?',
          [requestId]
        );
        
        if (requests.length === 0) {
          throw new Error('Vacation request not found');
        }
        
        const request = requests[0];
        
        // Update the request status
        await connection.query(
          `UPDATE vacation_requests 
          SET status = ?, approved_by = ?, approved_date = CURRENT_TIMESTAMP 
          WHERE id = ?`,
          [status, approvedBy, requestId]
        );
        
        // If approved, deduct from vacation balance
        if (status === 'approved') {
          const year = new Date(request.start_date).getFullYear();
          await connection.query(
            `UPDATE employee_vacation_entitlements 
            SET 
              total_used_current_year = total_used_current_year + ?,
              current_balance = current_balance - ?
            WHERE employee_id = ? AND year = ?`,
            [request.total_hours, request.total_hours, request.employee_id, year]
          );
        }
        
        await connection.commit();
        
        return this.getVacationRequestById(requestId);
        
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
   * Get all vacation requests (for admin view)
   * @param {Object} options - Query options
   * @returns {Promise<Array>} All vacation requests
   */
  static async getAllVacationRequests(options = {}) {
    try {
      const { limit = 20, offset = 0, status = null } = options;
      
      let query = `
        SELECT vr.*, 
          e.first_name, e.last_name,
          u.name as approved_by_name
        FROM vacation_requests vr
        LEFT JOIN employees e ON vr.employee_id = e.id
        LEFT JOIN users u ON vr.approved_by = u.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (status) {
        query += ' AND vr.status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY vr.request_date DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
      
      const [requests] = await db.query(query, params);
      
      return requests;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation summary for an employee
   * @param {string} employeeId - Employee ID
   * @param {number} year - Year (optional, defaults to current year)
   * @returns {Promise<Object>} Vacation summary
   */
  static async getVacationSummary(employeeId, year = null) {
    try {
      const currentYear = year || new Date().getFullYear();
      
      // Get entitlement data
      const entitlement = await this.getEntitlementByEmployeeAndYear(employeeId, currentYear);
      
      // Get pending requests
      const [pendingRequests] = await db.query(
        `SELECT SUM(total_hours) as pending_hours 
        FROM vacation_requests 
        WHERE employee_id = ? AND status = 'pending' 
        AND YEAR(start_date) = ?`,
        [employeeId, currentYear]
      );
      
      const pendingHours = pendingRequests[0]?.pending_hours || 0;
      
      return {
        entitlement,
        pendingHours: parseFloat(pendingHours),
        availableBalance: entitlement ? entitlement.current_balance - pendingHours : 0
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = VacationEntitlement;
