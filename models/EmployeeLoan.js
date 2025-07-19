const db = require('../config/db');

/**
 * @class EmployeeLoan
 * @description Model for employee loan management
 */
class EmployeeLoan {
  /**
   * Get all employee loans with pagination and filtering
   * @param {Object} options - Query options for pagination and filtering
   * @returns {Promise<Object>} Employee loans with pagination info
   */
  static async getAllLoans(options = {}) {
    try {
      const { 
        limit = 10, 
        offset = 0, 
        sortBy = 'created_at', 
        sortOrder = 'DESC',
        employeeId,
        status
      } = options;

      let query = `
        SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name
        FROM employee_loans el
        JOIN employees e ON el.employee_id = e.id
        WHERE 1=1
      `;
      let queryParams = [];

      // Apply filters
      if (employeeId) {
        query += ` AND el.employee_id = ?`;
        queryParams.push(employeeId);
      }

      if (status) {
        query += ` AND el.status = ?`;
        queryParams.push(status);
      }

      // Get total count for pagination
      const [countResult] = await db.query(
        `SELECT COUNT(*) as total FROM employee_loans el WHERE 1=1 
         ${employeeId ? 'AND el.employee_id = ?' : ''}
         ${status ? 'AND el.status = ?' : ''}`,
        queryParams
      );
      const total = countResult[0].total;

      // Add sorting and pagination
      query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
      queryParams.push(limit, offset);

      // Execute query
      const [loans] = await db.query(query, queryParams);
      
      return {
        loans,
        pagination: {
          total,
          limit,
          offset,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get a single loan by ID with payment history
   * @param {number} id - Loan ID
   * @returns {Promise<Object>} Loan details with payment history
   */
  static async getLoanById(id) {
    try {
      // Get loan details
      const [loans] = await db.query(
        `SELECT el.*, 
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.payment_frequency
        FROM employee_loans el
        JOIN employees e ON el.employee_id = e.id
        WHERE el.id = ?`,
        [id]
      );

      if (loans.length === 0) {
        return null;
      }

      const loan = loans[0];

      // Get payment history
      const [payments] = await db.query(
        `SELECT lp.*
        FROM loan_payments lp
        WHERE lp.loan_id = ?
        ORDER BY lp.payment_date DESC`,
        [id]
      );

      return {
        ...loan,
        payments
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new employee loan
   * @param {Object} loanData - Loan data
   * @returns {Promise<Object>} Created loan
   */
  static async createLoan(loanData) {
    const connection = await db.getConnection();
    let loanId;
    
    try {
      await connection.beginTransaction();
      
      // Calculate total amount with interest
      const principal = parseFloat(loanData.loan_amount);
      const interestRate = parseFloat(loanData.interest_rate || 0);
      const years = this.calculateLoanTermInYears(loanData.start_date, loanData.expected_end_date);
      const interestAmount = principal * (interestRate / 100) * years;
      const totalAmount = principal + interestAmount;
      
      // Insert the new loan
      const [result] = await connection.query(
        `INSERT INTO employee_loans (
          employee_id, loan_amount, interest_rate, total_amount, 
          remaining_amount, installment_amount, start_date, expected_end_date, 
          status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loanData.employee_id,
          principal,
          interestRate,
          totalAmount,
          totalAmount, // Initially, remaining amount equals total amount
          loanData.installment_amount,
          loanData.start_date,
          loanData.expected_end_date,
          loanData.status || 'active',
          loanData.notes || null
        ]
      );
      
      await connection.commit();
      
      // Get the loan ID and immediately release the connection
      loanId = result.insertId;
      connection.release();
      
      // Use a separate connection from the pool for getting loan details
      return await this.getLoanById(loanId);
      
    } catch (error) {
      await connection.rollback();
      connection.release(); // Make sure to release the connection in case of error
      throw error;
    }
  }

  /**
   * Update an existing employee loan
   * @param {number} id - Loan ID
   * @param {Object} data - Updated loan data
   * @returns {Promise<Object>} Updated loan
   */
  static async updateLoan(id, data) {
    try {
      // Get the current loan state
      const currentLoan = await this.getLoanById(id);
      if (!currentLoan) {
        throw new Error('Loan not found');
      }
      
      // Don't allow changing fundamental loan parameters if payments have been made
      if (currentLoan.payments && currentLoan.payments.length > 0) {
        // Filter out fields that can't be changed after payments
        const { loan_amount, interest_rate, total_amount, ...allowedUpdates } = data;
        data = allowedUpdates;
      }
      
      // Update the loan
      await db.query(
        `UPDATE employee_loans SET
          installment_amount = ?,
          status = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          data.installment_amount || currentLoan.installment_amount,
          data.status || currentLoan.status,
          data.notes || currentLoan.notes,
          id
        ]
      );
      
      // Return the updated loan
      return await this.getLoanById(id);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get active loans for an employee
   * @param {string} employeeId - Employee ID
   * @returns {Promise<Array>} Employee's active loans
   */
  static async getActiveLoansForEmployee(employeeId) {
    try {
      const [loans] = await db.query(
        `SELECT * FROM employee_loans 
         WHERE employee_id = ? AND status = 'active'
         ORDER BY created_at ASC`,
        [employeeId]
      );
      
      return loans;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process a loan payment during payroll run
   * @param {number} loanId - Loan ID
   * @param {number} payrollItemId - Payroll item ID
   * @param {number} amount - Payment amount
   * @param {Date} paymentDate - Payment date
   * @returns {Promise<Object>} Payment details
   */
  static async processPayment(loanId, payrollItemId, amount, paymentDate, existingConnection = null) {
    const connection = existingConnection || await db.getConnection();
    let paymentId;
    
    try {
      if (!existingConnection) {
        await connection.beginTransaction();
      }
      
      // Get current loan details
      const [loans] = await connection.query(
        `SELECT * FROM employee_loans WHERE id = ?`,
        [loanId]
      );
      
      if (loans.length === 0) {
        await connection.rollback();
        connection.release();
        throw new Error('Loan not found');
      }
      
      const loan = loans[0];
      const remainingBalance = parseFloat(loan.remaining_amount);
      
      // Check for existing payment for this payroll item to prevent duplicates
      const [existingPayments] = await connection.query(
        `SELECT id FROM loan_payments WHERE payroll_item_id = ? AND loan_id = ?`,
        [payrollItemId, loanId]
      );
      
      if (existingPayments.length > 0) {
        console.warn(`Payment for payroll_item_id ${payrollItemId} and loan_id ${loanId} already exists. Skipping.`);
        if (!existingConnection) {
          await connection.commit();
          connection.release();
        }
        return null; // Or some indicator that no new payment was made
      }
      
      // Calculate principal and interest portions
      const totalInterest = parseFloat(loan.total_amount) - parseFloat(loan.loan_amount);
      const loanAmount = parseFloat(loan.loan_amount);
      const principalRatio = loanAmount / parseFloat(loan.total_amount);
      
      let principalAmount = amount * principalRatio;
      let interestAmount = amount - principalAmount;
      
      // Ensure we don't overpay
      if (amount >= remainingBalance) {
        amount = remainingBalance;
        principalAmount = remainingBalance * principalRatio;
        interestAmount = remainingBalance - principalAmount;
      }
      
      // Calculate new remaining balance
      const newRemainingBalance = Math.max(0, remainingBalance - amount);
      
      // Insert payment record
      const [paymentResult] = await connection.query(
        `INSERT INTO loan_payments (
          loan_id, payroll_item_id, payment_amount,
          principal_amount, interest_amount, payment_date,
          remaining_balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          loanId,
          payrollItemId,
          amount,
          principalAmount,
          interestAmount,
          paymentDate,
          newRemainingBalance
        ]
      );
      
      // Update loan remaining balance and status
      const newStatus = newRemainingBalance <= 0 ? 'completed' : loan.status;
      
      await connection.query(
        `UPDATE employee_loans
         SET remaining_amount = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newRemainingBalance, newStatus, loanId]
      );
      
      if (!existingConnection) {
        await connection.commit();
      }
      
      // Get payment ID and immediately release the connection
      paymentId = paymentResult.insertId;
      
      // Get payment details
      const [payments] = await connection.query(
        `SELECT * FROM loan_payments WHERE id = ?`,
        [paymentId]
      );
      
      const paymentDetails = payments[0];
      if (!existingConnection) {
        connection.release(); // Release the connection after all operations are complete
      }
      
      return paymentDetails;
      
    } catch (error) {
      if (!existingConnection) {
        await connection.rollback();
        connection.release(); // Make sure to release the connection in case of error
      }
      throw error;
    }
  }
  
  /**
   * Calculate the term of a loan in years
   * @param {Date|string} startDate - Loan start date
   * @param {Date|string} endDate - Loan expected end date
   * @returns {number} Loan term in years (decimal)
   */
  static calculateLoanTermInYears(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays / 365;
  }
}

module.exports = EmployeeLoan;
