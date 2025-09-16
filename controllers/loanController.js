const db = require('../config/db');
const EmployeeLoan = require('../models/EmployeeLoan');
const { LOAN_TYPE } = require('../models/EmployeeLoan');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Get all loans with pagination and filtering
 * @route   GET /api/loans
 * @access  Private/Admin
 */
exports.getAllLoans = async (req, res) => {
  try {
    // Extract query parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const employeeId = req.query.employeeId;
    const status = req.query.status;
    
    // Get loans
    const result = await EmployeeLoan.getAllLoans({
      limit,
      offset,
      sortBy,
      sortOrder,
      employeeId,
      status
    });
    
    res.status(200).json(formatSuccess('Loans fetched successfully', result));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get loan by ID
 * @route   GET /api/loans/:id
 * @access  Private/Admin
 */
exports.getLoanById = async (req, res) => {
  try {
    const loan = await EmployeeLoan.getLoanById(req.params.id);
    
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }
    
    res.status(200).json(formatSuccess('Loan fetched successfully', loan));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Create new loan
 * @route   POST /api/loans
 * @access  Private/Admin
 */
exports.createLoan = async (req, res) => {
  try {
    const {
      employee_id,
      loan_amount,
      interest_rate,
      installment_amount,
      start_date,
      expected_end_date,
      status,
      notes,
      loan_type
    } = req.body;
    
    // Validate required fields
    if (!employee_id || !loan_amount || !installment_amount || !start_date) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Check if employee exists
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [employee_id]
    );
    
    if (employee.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Create loan
    const loan = await EmployeeLoan.createLoan({
      employee_id,
      loan_amount,
      interest_rate: interest_rate || 0,
      installment_amount,
      start_date,
      expected_end_date,
      status,
      notes,
      loan_type: loan_type || LOAN_TYPE.INTERNAL,
      created_by: req.user ? req.user.id : null
    });
    
    res.status(201).json(formatSuccess('Loan created successfully', loan));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update loan
 * @route   PUT /api/loans/:id
 * @access  Private/Admin
 */
exports.updateLoan = async (req, res) => {
  try {
    const {
      installment_amount,
      status,
      notes
    } = req.body;
    
    // Only allow updating specific fields
    const loan = await EmployeeLoan.updateLoan(req.params.id, {
      installment_amount,
      status,
      notes
    });
    
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }
    
    res.status(200).json(formatSuccess('Loan updated successfully', loan));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all loans for a specific employee
 * @route   GET /api/employees/:id/loans
 * @access  Private/Admin
 */
exports.getEmployeeLoans = async (req, res) => {
  try {
    const employeeId = req.params.id;
    
    // Check if employee exists
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [employeeId]
    );
    
    if (employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Get all loans for this employee
    const result = await EmployeeLoan.getAllLoans({
      employeeId,
      limit: 100,
      offset: 0
    });
    
    res.status(200).json(formatSuccess('Employee loans fetched successfully', result));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Create new third-party loan
 * @route   POST /api/loans/third-party
 * @access  Private/Admin
 */
exports.createThirdPartyLoan = async (req, res) => {
  try {
    const {
      employee_id,
      loan_amount,
      installment_amount,
      start_date,
      expected_end_date,
      status,
      notes,
      third_party_name,
      third_party_account_number,
      third_party_routing_number,
      third_party_reference
    } = req.body;
    
    // Validate required fields
    if (!employee_id || !loan_amount || !installment_amount || !start_date || 
        !third_party_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields for third-party loan'
      });
    }
    
    // Check if employee exists
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [employee_id]
    );
    
    if (employee.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Create loan
    const loan = await EmployeeLoan.createLoan({
      employee_id,
      loan_amount,
      interest_rate: 0, // No interest for third-party loans
      installment_amount,
      start_date,
      expected_end_date,
      status,
      notes,
      loan_type: LOAN_TYPE.THIRD_PARTY,
      third_party_name,
      third_party_account_number,
      third_party_routing_number,
      third_party_reference,
      created_by: req.user ? req.user.id : null
    });
    
    res.status(201).json(formatSuccess('Third-party loan created successfully', loan));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get third-party payment data for a payroll run
 * @route   GET /api/loans/third-party-payments/:payrollRunId
 * @access  Private/Admin
 */
exports.getThirdPartyPayments = async (req, res) => {
  try {
    const { payrollRunId } = req.params;
    
    const payments = await EmployeeLoan.getThirdPartyPaymentsForPayrollRun(payrollRunId);
    
    res.status(200).json(formatSuccess('Third-party payments fetched successfully', payments));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};
