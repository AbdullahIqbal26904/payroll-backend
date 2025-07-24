const db = require('../config/db');
const helpers = require('../utils/helpers');

/**
 * @class EmployeeVacation
 * @description Employee vacation model for vacation management
 */
class EmployeeVacation {
  /**
   * Create a new vacation entry
   * @param {Object} vacationData - Vacation data
   * @param {number} userId - User ID creating the entry
   * @returns {Promise<Object>} Created vacation entry
   */
  static async create(vacationData, userId) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Insert vacation entry
        const [result] = await connection.query(
          `INSERT INTO employee_vacations 
           (employee_id, start_date, end_date, total_hours, hourly_rate, status, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            vacationData.employee_id, 
            helpers.formatDate(vacationData.start_date), 
            helpers.formatDate(vacationData.end_date),
            vacationData.total_hours,
            vacationData.hourly_rate || null,
            vacationData.status || 'pending',
            userId
          ]
        );
        
        // Get the inserted vacation entry
        const [vacation] = await connection.query(
          `SELECT ev.*, 
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            e.employee_type
           FROM employee_vacations ev
           JOIN employees e ON ev.employee_id = e.id
           WHERE ev.id = ?`,
          [result.insertId]
        );
        
        await connection.commit();
        return vacation[0];
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
   * Update a vacation entry
   * @param {number} id - Vacation ID
   * @param {Object} vacationData - Updated vacation data
   * @returns {Promise<Object>} Updated vacation entry
   */
  static async update(id, vacationData) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Update fields
        const updateFields = [];
        const updateValues = [];
        
        if (vacationData.start_date) {
          updateFields.push('start_date = ?');
          updateValues.push(helpers.formatDate(vacationData.start_date));
        }
        
        if (vacationData.end_date) {
          updateFields.push('end_date = ?');
          updateValues.push(helpers.formatDate(vacationData.end_date));
        }
        
        if (vacationData.total_hours !== undefined) {
          updateFields.push('total_hours = ?');
          updateValues.push(vacationData.total_hours);
        }
        
        if (vacationData.hourly_rate !== undefined) {
          updateFields.push('hourly_rate = ?');
          updateValues.push(vacationData.hourly_rate);
        }
        
        if (vacationData.status) {
          updateFields.push('status = ?');
          updateValues.push(vacationData.status);
        }
        
        // Only update if there are fields to update
        if (updateFields.length > 0) {
          await connection.query(
            `UPDATE employee_vacations SET ${updateFields.join(', ')} WHERE id = ?`,
            [...updateValues, id]
          );
        }
        
        // Get updated vacation entry
        const [vacation] = await connection.query(
          `SELECT ev.*, 
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            e.employee_type
           FROM employee_vacations ev
           JOIN employees e ON ev.employee_id = e.id
           WHERE ev.id = ?`,
          [id]
        );
        
        await connection.commit();
        return vacation[0];
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
   * Delete a vacation entry
   * @param {number} id - Vacation ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    try {
      const [result] = await db.query('DELETE FROM employee_vacations WHERE id = ?', [id]);
      return result.affectedRows > 0;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get a vacation entry by ID
   * @param {number} id - Vacation ID
   * @returns {Promise<Object>} Vacation entry
   */
  static async getById(id) {
    try {
      const [vacation] = await db.query(
        `SELECT ev.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
         FROM employee_vacations ev
         JOIN employees e ON ev.employee_id = e.id
         WHERE ev.id = ?`,
        [id]
      );
      
      return vacation[0];
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get all vacation entries
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Vacation entries
   */
  static async getAll(filters = {}) {
    try {
      let query = `
        SELECT ev.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
        FROM employee_vacations ev
        JOIN employees e ON ev.employee_id = e.id
      `;
      
      const queryParams = [];
      const conditions = [];
      
      // Apply filters
      if (filters.employee_id) {
        conditions.push('ev.employee_id = ?');
        queryParams.push(filters.employee_id);
      }
      
      if (filters.status) {
        conditions.push('ev.status = ?');
        queryParams.push(filters.status);
      }
      
      if (filters.start_date) {
        conditions.push('ev.start_date >= ?');
        queryParams.push(helpers.formatDate(filters.start_date));
      }
      
      if (filters.end_date) {
        conditions.push('ev.end_date <= ?');
        queryParams.push(helpers.formatDate(filters.end_date));
      }
      
      // Add WHERE clause if conditions exist
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Add ORDER BY
      query += ' ORDER BY ev.start_date DESC';
      
      const [vacations] = await db.query(query, queryParams);
      return vacations;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation entries for a specific employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Array>} Vacation entries
   */
  static async getByEmployeeId(employeeId) {
    try {
      const [vacations] = await db.query(
        `SELECT ev.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
         FROM employee_vacations ev
         JOIN employees e ON ev.employee_id = e.id
         WHERE ev.employee_id = ?
         ORDER BY ev.start_date DESC`,
        [employeeId]
      );
      
      return vacations;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get vacation entries that overlap with a given date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} employeeId - Optional employee ID to filter by
   * @returns {Promise<Array>} Overlapping vacation entries
   */
  static async getOverlappingVacations(startDate, endDate, employeeId = null) {
    try {
      let query = `
        SELECT ev.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type,
          e.hourly_rate as employee_hourly_rate
        FROM employee_vacations ev
        JOIN employees e ON ev.employee_id = e.id
        WHERE ev.status = 'approved'
          AND (
            (ev.start_date <= ? AND ev.end_date >= ?) OR
            (ev.start_date <= ? AND ev.end_date >= ?) OR
            (ev.start_date >= ? AND ev.end_date <= ?)
          )
      `;
      
      const queryParams = [
        endDate, startDate,   // Vacation starts before period ends AND ends after period starts
        startDate, startDate, // Vacation starts before period starts AND ends after period starts
        startDate, endDate    // Vacation is completely within the period
      ];
      
      // Add employee filter if provided
      if (employeeId) {
        query += ' AND ev.employee_id = ?';
        queryParams.push(employeeId);
      }
      
      const [vacations] = await db.query(query, queryParams);
      return vacations;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Calculate vacation hours and pay for a specific employee within a pay period
   * @param {string} employeeId - Employee ID
   * @param {string} startDate - Pay period start date (YYYY-MM-DD)
   * @param {string} endDate - Pay period end date (YYYY-MM-DD)
   * @param {Object} employeeData - Employee data including hourly_rate and employee_type
   * @returns {Promise<Object>} Vacation calculation results
   */
  static async calculateVacationForPeriod(employeeId, startDate, endDate, employeeData) {
    try {
      // Get approved vacations that overlap with the pay period
      const vacations = await this.getOverlappingVacations(startDate, endDate, employeeId);
      
      if (vacations.length === 0) {
        return {
          vacationHours: 0,
          vacationPay: 0,
          vacationEntries: []
        };
      }
      
      let totalVacationHours = 0;
      let totalVacationPay = 0;
      
      // Process each vacation entry
      for (const vacation of vacations) {
        // For now, we'll use the total_hours field directly
        // In a more complex system, you might calculate the actual hours within the pay period
        totalVacationHours += parseFloat(vacation.total_hours);
        
        // Calculate vacation pay based on employee type
        if (employeeData.employee_type === 'hourly') {
          // For hourly employees, use the vacation's hourly_rate if specified, 
          // otherwise use the employee's standard hourly rate
          const hourlyRate = vacation.hourly_rate || employeeData.hourly_rate;
          const vacationPay = parseFloat(vacation.total_hours) * hourlyRate;
          totalVacationPay += vacationPay;
        } else if (employeeData.employee_type === 'salary') {
          // For salaried employees, vacation pay is included in their regular salary
          // We still track the hours but don't add additional pay
          totalVacationPay = 0; // Will be handled by regular salary calculation
        } else if (employeeData.employee_type === 'private_duty_nurse') {
          // For private duty nurses, use their specified hourly rate
          const hourlyRate = vacation.hourly_rate || employeeData.hourly_rate;
          const vacationPay = parseFloat(vacation.total_hours) * hourlyRate;
          totalVacationPay += vacationPay;
        }
      }
      
      return {
        vacationHours: totalVacationHours,
        vacationPay: totalVacationPay,
        vacationEntries: vacations
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = EmployeeVacation;
