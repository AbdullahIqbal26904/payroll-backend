const db = require('../config/db');

/**
 * @class EmployeeLoan
 * @description Employee loan model for managing loan data and calculations
 */
class EmployeeLoan {
  /**
   * Get all loans with optional filtering
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Array>} Array of loan records
   */
  static async getAllLoans(options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT l.*, e.first_name, e.last_name, e.employee_id
        FROM employee_loans l
        JOIN employees e ON l.employee_id = e.id
      `;
      
      // Add filters if provided
      const whereConditions = [];
      const queryParams = [];
      
      if (options.employeeId) {
        whereConditions.push('l.employee_id = ?');
        queryParams.push(options.employeeId);
      }
      
      if (options.status) {
        whereConditions.push('l.status = ?');
        queryParams.push(options.status);
      }
      
      if (whereConditions.length > 0) {
        query += ` WHERE ${whereConditions.join(' AND ')}`;
      }
      
      // Add ordering and pagination
      query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);
      
      // Execute the query
      const [loans] = await db.query(query, queryParams);
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM employee_loans l
        ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''}
      `;
      
      const [countResult] = await db.query(countQuery, queryParams.slice(0, -2));
      const total = countResult[0].total;
      
      return {
        loans,
        totalCount: total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Get a loan by ID
   * @param {number} id - Loan ID
   * @returns {Promise<Object>} Loan details
   */
  static async getLoanById(id) {
    try {
      const [loans] = await db.query(`
        SELECT l.*, e.first_name, e.last_name, e.employee_id
        FROM employee_loans l
        JOIN employees e ON l.employee_id = e.id
        WHERE l.id = ?
      `, [id]);
      
      if (loans.length === 0) {
        return null;
      }
      
      // Get payment history for this loan
      const [payments] = await db.query(`
        SELECT lp.*, lp.payment_date
        FROM loan_payments lp
        LEFT JOIN payroll_items pi ON lp.payroll_item_id = pi.id
        WHERE lp.loan_id = ?
        ORDER BY lp.payment_date DESC
      `, [id]);
      
      return {
        ...loans[0],
        payments
      };
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Create a new employee loan
   * @param {Object} loanData - Loan details
   * @returns {Promise<Object>} Created loan
   */
  static async createLoan(loanData) {
    try {
      const {
        employee_id,
        loan_amount,
        interest_rate,
        installment_amount,
        start_date,
        expected_end_date,
        notes
      } = loanData;
      
      // Calculate total amount (principal + interest)
      const totalAmount = parseFloat(loan_amount) * (1 + parseFloat(interest_rate) / 100);
      
      const [result] = await db.query(`
        INSERT INTO employee_loans (
          employee_id, loan_amount, interest_rate, total_amount,
          remaining_amount, installment_amount, start_date,
          expected_end_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        employee_id,
        loan_amount,
        interest_rate,
        totalAmount.toFixed(2),
        totalAmount.toFixed(2), // Initially, remaining amount equals total amount
        installment_amount,
        start_date,
        expected_end_date,
        notes || null
      ]);
      
      return this.getLoanById(result.insertId);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update an existing loan
   * @param {number} id - Loan ID
   * @param {Object} loanData - Updated loan details
   * @returns {Promise<Object>} Updated loan
   */
  static async updateLoan(id, loanData) {
    try {
      const allowedFields = [
        'installment_amount',
        'expected_end_date',
        'status',
        'notes'
      ];
      
      // Build the update query with only allowed fields
      const updates = [];
      const values = [];
      
      Object.keys(loanData).forEach(key => {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = ?`);
          values.push(loanData[key]);
        }
      });
      
      // If no valid fields to update
      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }
      
      // Add the ID to the values array
      values.push(id);
      
      await db.query(`
        UPDATE employee_loans
        SET ${updates.join(', ')}
        WHERE id = ?
      `, values);
      
      return this.getLoanById(id);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Process loan payment as part of payroll
   * @param {number} loanId - Loan ID
   * @param {number} payrollItemId - Payroll item ID
   * @param {number} paymentAmount - Payment amount
   * @param {string} paymentDate - Payment date
   * @returns {Promise<Object>} Payment result
   */
  static async processPayment(loanId, payrollItemId, paymentAmount, paymentDate) {
    try {
      // Start a transaction
      await db.query('START TRANSACTION');
      
      // Get current loan details
      const [loans] = await db.query('SELECT * FROM employee_loans WHERE id = ? FOR UPDATE', [loanId]);
      
      if (loans.length === 0) {
        await db.query('ROLLBACK');
        throw new Error('Loan not found');
      }
      
      const loan = loans[0];
      
      // Calculate new remaining amount
      let remainingAmount = parseFloat(loan.remaining_amount) - parseFloat(paymentAmount);
      remainingAmount = Math.max(remainingAmount, 0); // Ensure it doesn't go negative
      
      // Update loan remaining amount
      await db.query(`
        UPDATE employee_loans
        SET remaining_amount = ?,
            status = CASE
              WHEN ? <= 0 THEN 'completed'
              ELSE status
            END
        WHERE id = ?
      `, [remainingAmount.toFixed(2), remainingAmount, loanId]);
      
      // Record the payment
      const [payment] = await db.query(`
        INSERT INTO loan_payments (
          loan_id, payroll_item_id, payment_amount, payment_date
        ) VALUES (?, ?, ?, ?)
      `, [loanId, payrollItemId, paymentAmount, paymentDate]);
      
      // Commit the transaction
      await db.query('COMMIT');
      
      return {
        paymentId: payment.insertId,
        loanId,
        paymentAmount,
        remainingAmount
      };
    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      throw error;
    }
  }
  
  /**
   * Get active loans for an employee
   * @param {number} employeeId - Employee ID
   * @returns {Promise<Array>} Active loans for employee
   */
  static async getActiveLoansForEmployee(employeeId) {
    try {
      const [loans] = await db.query(`
        SELECT *
        FROM employee_loans
        WHERE employee_id = ? AND status = 'active' AND remaining_amount > 0
        ORDER BY created_at ASC
      `, [employeeId]);
      
      return loans;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = EmployeeLoan;
