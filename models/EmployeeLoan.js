const db = require('../config/db');

// Loan type constants
const LOAN_TYPE = {
  INTERNAL: 'internal',
  THIRD_PARTY: 'third_party'
};

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

      const enrichedLoans = loans.map(loan => this.enrichLoanRow(loan));

      return {
        loans: enrichedLoans,
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
      const enrichedLoan = this.enrichLoanRow(loan);

      // Get payment history
      const [payments] = await db.query(
        `SELECT lp.*
        FROM loan_payments lp
        WHERE lp.loan_id = ?
        ORDER BY lp.payment_date DESC`,
        [id]
      );

      return {
        ...enrichedLoan,
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
      
      // Check if employee already has a third-party loan if this is a third-party loan
      if (loanData.loan_type === LOAN_TYPE.THIRD_PARTY) {
        const [existingLoans] = await connection.query(
          `SELECT COUNT(*) as count FROM employee_loans 
           WHERE employee_id = ? AND loan_type = ? AND status IN ('active', 'pending')`,
          [loanData.employee_id, LOAN_TYPE.THIRD_PARTY]
        );
        
        if (existingLoans[0].count > 0) {
          throw new Error('Employee already has an active third-party loan. Only one is allowed per employee.');
        }
      }
      
      // Get employee payment frequency if not calculating expected end date
      let employeePaymentFrequency;
      if (!loanData.expected_end_date) {
        const [employeeResult] = await connection.query(
          `SELECT payment_frequency FROM employees WHERE id = ?`,
          [loanData.employee_id]
        );
        
        if (employeeResult.length === 0) {
          throw new Error('Employee not found');
        }
        
        employeePaymentFrequency = employeeResult[0].payment_frequency;
      }
      
      // Calculate total amount with interest
      const principal = parseFloat(loanData.loan_amount);
      const interestRate = parseFloat(loanData.interest_rate || 0);
      
      let years, interestAmount, totalAmount, expected_end_date;
      
      if (loanData.expected_end_date) {
        // If expected_end_date is provided, calculate interest based on term
        years = this.calculateLoanTermInYears(loanData.start_date, loanData.expected_end_date);
        interestAmount = principal * (interestRate / 100) * years;
        totalAmount = principal + interestAmount;
        expected_end_date = loanData.expected_end_date;
      } else {
        // Calculate a temporary total amount
        interestAmount = principal * (interestRate / 100);
        totalAmount = principal + interestAmount;
        
        // Calculate expected end date based on installment amount and payment frequency
        expected_end_date = this.calculateExpectedEndDate(
          totalAmount,
          parseFloat(loanData.installment_amount),
          loanData.start_date,
          employeePaymentFrequency
        ).toISOString().split('T')[0]; // Format as YYYY-MM-DD
        
        // Now recalculate the interest with the proper term
        years = this.calculateLoanTermInYears(loanData.start_date, expected_end_date);
        interestAmount = principal * (interestRate / 100) * years;
        totalAmount = principal + interestAmount;
      }
      
      // Insert the new loan
      const [result] = await connection.query(
        `INSERT INTO employee_loans (
          employee_id, loan_amount, interest_rate, total_amount, 
          remaining_amount, installment_amount, start_date, expected_end_date, 
          status, notes, loan_type, third_party_name, third_party_account_number,
          third_party_routing_number, third_party_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loanData.employee_id,
          principal,
          interestRate,
          totalAmount,
          totalAmount, // Initially, remaining amount equals total amount
          loanData.installment_amount,
          loanData.start_date,
          expected_end_date,
          loanData.status || 'active',
          loanData.notes || null,
          loanData.loan_type || LOAN_TYPE.INTERNAL,
          loanData.third_party_name || null,
          loanData.third_party_account_number || null,
          loanData.third_party_routing_number || null,
          loanData.third_party_reference || null
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

      return loans.map(loan => this.enrichLoanRow(loan));
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
  
  static enrichLoanRow(loan) {
    if (!loan) {
      return loan;
    }

    const installmentAmount = parseFloat(loan.installment_amount);
    if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
      return {
        ...loan,
        total_installments: null,
        installments_remaining: null
      };
    }

    const totalAmount = parseFloat(loan.total_amount);
    const remainingAmount = parseFloat(loan.remaining_amount);

    const normalizedTotal = Number.isFinite(totalAmount) && totalAmount >= 0 ? totalAmount : 0;
    const normalizedRemaining = Number.isFinite(remainingAmount) ? Math.max(0, remainingAmount) : normalizedTotal;

    const totalInstallments = Math.max(0, Math.ceil(normalizedTotal / installmentAmount));
    const installmentsRemaining = Math.max(0, Math.ceil(normalizedRemaining / installmentAmount));

    return {
      ...loan,
      total_installments: totalInstallments,
      installments_remaining: installmentsRemaining
    };
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
  
  /**
   * Calculate the expected end date for a loan
   * @param {number} totalAmount - Total loan amount including interest
   * @param {number} installmentAmount - Amount deducted per pay period
   * @param {Date|string} startDate - Loan start date
   * @param {string} paymentFrequency - Employee payment frequency (weekly, bi-weekly, monthly)
   * @returns {Date} Expected end date
   */
  static calculateExpectedEndDate(totalAmount, installmentAmount, startDate, paymentFrequency) {
    // Calculate number of installments
    const numberOfInstallments = Math.ceil(totalAmount / installmentAmount);
    
    // Calculate days per installment based on payment frequency
    let daysPerPaymentCycle;
    switch(paymentFrequency) {
      case 'weekly':
        daysPerPaymentCycle = 7;
        break;
      case 'bi-weekly':
        daysPerPaymentCycle = 14;
        break;
      case 'monthly':
        daysPerPaymentCycle = 30; // Approximate
        break;
      default:
        daysPerPaymentCycle = 30; // Default to monthly if unknown
    }
    
    // Calculate total days to repay
    const totalDaysToRepay = numberOfInstallments * daysPerPaymentCycle;
    
    // Calculate end date
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(startDateObj.getDate() + totalDaysToRepay);
    
    return endDateObj;
  }
  
  /**
   * Get third-party payment data for a specific payroll run
   * @param {number} payrollRunId - Payroll run ID
   * @returns {Promise<Array>} Third-party payment information
   */
  static async getThirdPartyPaymentsForPayrollRun(payrollRunId) {
    try {
      const [payments] = await db.query(
        `SELECT 
          lp.payment_amount,
          el.third_party_name,
          el.third_party_account_number,
          el.third_party_routing_number,
          el.third_party_reference,
          e.first_name,
          e.last_name,
          e.id as employee_number
        FROM 
          loan_payments lp
        JOIN 
          employee_loans el ON lp.loan_id = el.id
        JOIN 
          employees e ON el.employee_id = e.id
        WHERE 
          lp.payroll_item_id IN (SELECT id FROM payroll_items WHERE payroll_run_id = ?)
          AND el.loan_type = ?`,
        [payrollRunId, LOAN_TYPE.THIRD_PARTY]
      );
      
      return payments;
    } catch (error) {
      throw error;
    }
  }
}

// Export the class and loan type constants
module.exports = EmployeeLoan;
module.exports.LOAN_TYPE = LOAN_TYPE;
