const db = require('../config/db');
const helpers = require('../utils/helpers');

/**
 * @class EmployeeLeave
 * @description Employee leave model for sick/maternity leave management
 */
class EmployeeLeave {
  /**
   * Create a new leave entry
   * @param {Object} leaveData - Leave data
   * @param {number} userId - User ID creating the entry
   * @returns {Promise<Object>} Created leave entry
   */
  static async create(leaveData, userId) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get employee details to use their hourly rate and calculate leave hours
        const [employeeRows] = await connection.query(
          `SELECT id, hourly_rate, employee_type, standard_hours, salary_amount 
           FROM employees 
           WHERE id = ?`,
          [leaveData.employee_id]
        );
        
        if (employeeRows.length === 0) {
          throw new Error('Employee not found');
        }
        
        const employee = employeeRows[0];
        const formattedStartDate = helpers.formatDate(leaveData.start_date);
        const formattedEndDate = helpers.formatDate(leaveData.end_date);
        
        // Calculate leave hours based on working days if not provided
        let totalHours = leaveData.total_hours;
        if (!totalHours) {
          // Calculate standard daily hours (standard_hours / 5) or default to 8
          const standardDailyHours = employee.standard_hours ? employee.standard_hours / 5 : 8;
          totalHours = helpers.calculateVacationHours(
            formattedStartDate, 
            formattedEndDate, 
            standardDailyHours
          );
        }
        
        // Use employee's hourly rate if not provided
        const hourlyRate = leaveData.hourly_rate || employee.hourly_rate;
        
        // Default payment percentage to 100% if not specified
        const paymentPercentage = leaveData.payment_percentage || 100;
        
        // Insert leave entry
        const [result] = await connection.query(
          `INSERT INTO employee_leaves 
           (employee_id, start_date, end_date, total_hours, hourly_rate, status, leave_type, payment_percentage, created_by) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            leaveData.employee_id, 
            formattedStartDate, 
            formattedEndDate,
            totalHours,
            hourlyRate,
            leaveData.status || 'pending',
            leaveData.leave_type,
            paymentPercentage,
            userId
          ]
        );
        
        // Get the inserted leave entry
        const [leave] = await connection.query(
          `SELECT el.*, 
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            e.employee_type
           FROM employee_leaves el
           JOIN employees e ON el.employee_id = e.id
           WHERE el.id = ?`,
          [result.insertId]
        );
        
        await connection.commit();
        return leave[0];
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
   * Update a leave entry
   * @param {number} id - Leave ID
   * @param {Object} leaveData - Updated leave data
   * @returns {Promise<Object>} Updated leave entry
   */
  static async update(id, leaveData) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get current leave data
        const [currentLeave] = await connection.query(
          `SELECT * FROM employee_leaves WHERE id = ?`,
          [id]
        );
        
        if (currentLeave.length === 0) {
          throw new Error('Leave entry not found');
        }
        
        // Get employee data
        const [employeeRows] = await connection.query(
          `SELECT id, hourly_rate, employee_type, standard_hours, salary_amount 
           FROM employees 
           WHERE id = ?`,
          [currentLeave[0].employee_id]
        );
        
        if (employeeRows.length === 0) {
          throw new Error('Employee not found');
        }
        
        const employee = employeeRows[0];
        
        // Prepare update fields
        const updateFields = [];
        const updateValues = [];
        
        // Format dates if provided
        let startDate = currentLeave[0].start_date;
        let endDate = currentLeave[0].end_date;
        
        if (leaveData.start_date) {
          startDate = helpers.formatDate(leaveData.start_date);
          updateFields.push('start_date = ?');
          updateValues.push(startDate);
        }
        
        if (leaveData.end_date) {
          endDate = helpers.formatDate(leaveData.end_date);
          updateFields.push('end_date = ?');
          updateValues.push(endDate);
        }
        
        // If dates changed but total_hours not provided, recalculate
        if ((leaveData.start_date || leaveData.end_date) && leaveData.total_hours === undefined) {
          // Calculate standard daily hours (standard_hours / 5) or default to 8
          const standardDailyHours = employee.standard_hours ? employee.standard_hours / 5 : 8;
          
          const calculatedHours = helpers.calculateVacationHours(
            startDate, 
            endDate, 
            standardDailyHours
          );
          
          updateFields.push('total_hours = ?');
          updateValues.push(calculatedHours);
        } else if (leaveData.total_hours !== undefined) {
          updateFields.push('total_hours = ?');
          updateValues.push(leaveData.total_hours);
        }
        
        // Update hourly rate if provided
        if (leaveData.hourly_rate !== undefined) {
          updateFields.push('hourly_rate = ?');
          updateValues.push(leaveData.hourly_rate);
        } else if (!currentLeave[0].hourly_rate) {
          // If the current hourly_rate is null and none provided, use employee's
          updateFields.push('hourly_rate = ?');
          updateValues.push(employee.hourly_rate);
        }
        
        // Update leave type if provided
        if (leaveData.leave_type) {
          updateFields.push('leave_type = ?');
          updateValues.push(leaveData.leave_type);
        }
        
        // Update payment percentage if provided
        if (leaveData.payment_percentage !== undefined) {
          updateFields.push('payment_percentage = ?');
          updateValues.push(leaveData.payment_percentage);
        }
        
        // Update status if provided
        if (leaveData.status) {
          updateFields.push('status = ?');
          updateValues.push(leaveData.status);
        }
        
        // Only update if there are fields to update
        if (updateFields.length > 0) {
          await connection.query(
            `UPDATE employee_leaves SET ${updateFields.join(', ')} WHERE id = ?`,
            [...updateValues, id]
          );
        }
        
        // Get updated leave entry
        const [leave] = await connection.query(
          `SELECT el.*, 
            CONCAT(e.first_name, ' ', e.last_name) as employee_name,
            e.employee_type
           FROM employee_leaves el
           JOIN employees e ON el.employee_id = e.id
           WHERE el.id = ?`,
          [id]
        );
        
        await connection.commit();
        return leave[0];
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
   * Delete a leave entry
   * @param {number} id - Leave ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id) {
    try {
      const connection = await db.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Check if leave entry exists
        const [leave] = await connection.query(
          `SELECT * FROM employee_leaves WHERE id = ?`,
          [id]
        );
        
        if (leave.length === 0) {
          throw new Error('Leave entry not found');
        }
        
        // Delete leave entry
        await connection.query(
          `DELETE FROM employee_leaves WHERE id = ?`,
          [id]
        );
        
        await connection.commit();
        return true;
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
   * Get a leave entry by ID
   * @param {number} id - Leave ID
   * @returns {Promise<Object>} Leave entry
   */
  static async getById(id) {
    try {
      const [leave] = await db.query(
        `SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
         FROM employee_leaves el
         JOIN employees e ON el.employee_id = e.id
         WHERE el.id = ?`,
        [id]
      );
      
      if (leave.length === 0) {
        throw new Error('Leave entry not found');
      }
      
      return leave[0];
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get all leave entries
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Leave entries
   */
  static async getAll(filters = {}) {
    try {
      let query = `
        SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
        FROM employee_leaves el
        JOIN employees e ON el.employee_id = e.id
      `;
      
      const queryParams = [];
      const conditions = [];
      
      // Apply filters
      if (filters.employee_id) {
        conditions.push('el.employee_id = ?');
        queryParams.push(filters.employee_id);
      }
      
      if (filters.leave_type) {
        conditions.push('el.leave_type = ?');
        queryParams.push(filters.leave_type);
      }
      
      if (filters.status) {
        conditions.push('el.status = ?');
        queryParams.push(filters.status);
      }
      
      if (filters.start_date) {
        conditions.push('el.start_date >= ?');
        queryParams.push(helpers.formatDate(filters.start_date));
      }
      
      if (filters.end_date) {
        conditions.push('el.end_date <= ?');
        queryParams.push(helpers.formatDate(filters.end_date));
      }
      
      // Add WHERE clause if conditions exist
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
      
      // Add ORDER BY
      query += ' ORDER BY el.start_date DESC';
      
      const [leaves] = await db.query(query, queryParams);
      return leaves;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get leave entries for a specific employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Array>} Leave entries
   */
  static async getByEmployeeId(employeeId) {
    try {
      const [leaves] = await db.query(
        `SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type
         FROM employee_leaves el
         JOIN employees e ON el.employee_id = e.id
         WHERE el.employee_id = ?
         ORDER BY el.start_date DESC`,
        [employeeId]
      );
      
      return leaves;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get leave entries that overlap with a given date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} employeeId - Optional employee ID to filter by
   * @returns {Promise<Array>} Overlapping leave entries
   */
  static async getOverlappingLeaves(startDate, endDate, employeeId = null) {
    try {
      let query = `
        SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_type,
          e.hourly_rate as employee_hourly_rate,
          e.salary_amount
        FROM employee_leaves el
        JOIN employees e ON el.employee_id = e.id
        WHERE el.status = 'approved'
          AND (
            (el.start_date <= ? AND el.end_date >= ?) OR
            (el.start_date <= ? AND el.end_date >= ?) OR
            (el.start_date >= ? AND el.end_date <= ?)
          )
      `;
      
      const queryParams = [
        endDate, startDate,   // Leave starts before period ends AND ends after period starts
        startDate, startDate, // Leave starts before period starts AND ends after period starts
        startDate, endDate    // Leave is completely within the period
      ];
      
      // Add employee filter if provided
      if (employeeId) {
        query += ' AND el.employee_id = ?';
        queryParams.push(employeeId);
      }
      
      const [leaves] = await db.query(query, queryParams);
      return leaves;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Calculate leave hours and pay for a specific employee within a pay period
   * @param {string} employeeId - Employee ID
   * @param {string} startDate - Pay period start date (YYYY-MM-DD)
   * @param {string} endDate - Pay period end date (YYYY-MM-DD)
   * @param {Object} employeeData - Employee data including hourly_rate, employee_type and salary_amount
   * @returns {Promise<Object>} Leave calculation results
   */
  static async calculateLeaveForPeriod(employeeId, startDate, endDate, employeeData) {
    try {
      // Get approved leave entries that overlap with the pay period
      const leaves = await this.getOverlappingLeaves(startDate, endDate, employeeId);
      
      if (leaves.length === 0) {
        return {
          leaveHours: 0,
          leaveAmount: 0,
          leaveType: null,
          leaveEntries: []
        };
      }
      
      let totalLeaveHours = 0;
      let totalLeaveAmount = 0;
      let leaveType = leaves[0].leave_type; // Use the first leave type if multiple
      
      // Process each leave entry
      for (const leave of leaves) {
        // Add up leave hours
        totalLeaveHours += parseFloat(leave.total_hours);
        
        // Calculate leave pay based on employee type and payment percentage
        // Supervisors use the same leave calculation as salaried employees
        if (employeeData.employee_type === 'hourly') {
          // For hourly employees, use the leave's hourly_rate if specified, 
          // otherwise use the employee's standard hourly rate
          const hourlyRate = leave.hourly_rate || employeeData.hourly_rate;
          const paymentPercentage = leave.payment_percentage / 100;
          const leaveAmount = parseFloat(leave.total_hours) * hourlyRate * paymentPercentage;
          totalLeaveAmount += leaveAmount;
        } else if (employeeData.employee_type === 'salary' || employeeData.employee_type === 'supervisor') {
          // For salaried employees and supervisors, calculate leave pay based on their equivalent hourly rate
          const standardHoursPerPeriod = employeeData.standard_hours || 80; // Default bi-weekly
          const standardPayPeriods = 26; // Bi-weekly
          const yearlyPay = employeeData.salary_amount;
          const payPerPeriod = yearlyPay / standardPayPeriods;
          const effectiveHourlyRate = payPerPeriod / standardHoursPerPeriod;
          
          const paymentPercentage = leave.payment_percentage / 100;
          const leaveAmount = parseFloat(leave.total_hours) * effectiveHourlyRate * paymentPercentage;
          totalLeaveAmount += leaveAmount;
        } else if (employeeData.employee_type === 'private_duty_nurse') {
          // For private duty nurses, use their specified hourly rate
          const hourlyRate = leave.hourly_rate || employeeData.hourly_rate;
          const paymentPercentage = leave.payment_percentage / 100;
          const leaveAmount = parseFloat(leave.total_hours) * hourlyRate * paymentPercentage;
          totalLeaveAmount += leaveAmount;
        }
      }
      
      return {
        leaveHours: totalLeaveHours,
        leaveAmount: totalLeaveAmount,
        leaveType: leaveType,
        leaveEntries: leaves
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = EmployeeLeave;