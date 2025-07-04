const EmployeeLoan = require('../models/EmployeeLoan');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Get all employee loans
 * @route   GET /api/loans
 * @access  Private/Admin
 */
exports.getLoans = async (req, res) => {
  try {
    // Parse pagination options
    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 10,
      employeeId: req.query.employeeId ? parseInt(req.query.employeeId, 10) : null,
      status: req.query.status || null
    };

    const result = await EmployeeLoan.getAllLoans(options);

    return res.status(200).json(formatSuccess(
      'Employee loans retrieved successfully',
      result
    ));
  } catch (error) {
    console.error('Error getting loans:', error);
    return res.status(500).json(formatError('Failed to retrieve loans'));
  }
};

/**
 * @desc    Get a specific loan by ID
 * @route   GET /api/loans/:id
 * @access  Private/Admin
 */
exports.getLoanById = async (req, res) => {
  try {
    const loan = await EmployeeLoan.getLoanById(req.params.id);
    
    if (!loan) {
      return res.status(404).json(formatError('Loan not found'));
    }

    return res.status(200).json(formatSuccess(
      'Loan retrieved successfully',
      loan
    ));
  } catch (error) {
    console.error('Error getting loan:', error);
    return res.status(500).json(formatError('Failed to retrieve loan'));
  }
};

/**
 * @desc    Create a new employee loan
 * @route   POST /api/loans
 * @access  Private/Admin
 */
exports.createLoan = async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['employee_id', 'loan_amount', 'interest_rate', 'installment_amount', 'start_date'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json(formatError(`Missing required fields: ${missingFields.join(', ')}`));
    }
    
    // Validate numeric fields
    const numericFields = ['loan_amount', 'interest_rate', 'installment_amount'];
    for (const field of numericFields) {
      if (isNaN(parseFloat(req.body[field])) || parseFloat(req.body[field]) <= 0) {
        return res.status(400).json(formatError(`Field ${field} must be a positive number`));
      }
    }
    
    // Calculate expected end date if not provided
    if (!req.body.expected_end_date) {
      const loanAmount = parseFloat(req.body.loan_amount);
      const installmentAmount = parseFloat(req.body.installment_amount);
      const interestRate = parseFloat(req.body.interest_rate);
      
      // Calculate total loan amount with interest
      const totalAmount = loanAmount * (1 + interestRate / 100);
      
      // Calculate number of payments needed
      const numberOfPayments = Math.ceil(totalAmount / installmentAmount);
      
      // Calculate expected end date (assuming bi-weekly payments)
      const startDate = new Date(req.body.start_date);
      const expectedEndDate = new Date(startDate);
      expectedEndDate.setDate(startDate.getDate() + (numberOfPayments * 14)); // Bi-weekly (14 days)
      
      req.body.expected_end_date = expectedEndDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    }
    
    const loan = await EmployeeLoan.createLoan(req.body);

    return res.status(201).json(formatSuccess(
      'Employee loan created successfully',
      loan
    ));
  } catch (error) {
    console.error('Error creating loan:', error);
    return res.status(500).json(formatError('Failed to create employee loan'));
  }
};

/**
 * @desc    Update an employee loan
 * @route   PUT /api/loans/:id
 * @access  Private/Admin
 */
exports.updateLoan = async (req, res) => {
  try {
    // Check if loan exists
    const loan = await EmployeeLoan.getLoanById(req.params.id);
    
    if (!loan) {
      return res.status(404).json(formatError('Loan not found'));
    }
    
    // Only specific fields can be updated after loan creation
    const updatedLoan = await EmployeeLoan.updateLoan(req.params.id, req.body);

    return res.status(200).json(formatSuccess(
      'Employee loan updated successfully',
      updatedLoan
    ));
  } catch (error) {
    console.error('Error updating loan:', error);
    return res.status(500).json(formatError(`Failed to update employee loan: ${error.message}`));
  }
};

/**
 * @desc    Get loans for a specific employee
 * @route   GET /api/employees/:id/loans
 * @access  Private/Admin
 */
exports.getEmployeeLoans = async (req, res) => {
  try {
    const employeeId = req.params.id;
    
    // Use the standard getLoans function with employee filter
    const options = {
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 10,
      employeeId: employeeId,
      status: req.query.status || null
    };
    
    const result = await EmployeeLoan.getAllLoans(options);

    return res.status(200).json(formatSuccess(
      'Employee loans retrieved successfully',
      result
    ));
  } catch (error) {
    console.error('Error getting employee loans:', error);
    return res.status(500).json(formatError('Failed to retrieve employee loans'));
  }
};
