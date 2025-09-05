const { check, validationResult } = require('express-validator');

// Validation for login request
exports.loginValidation = [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').not().isEmpty()
];

// Validation for MFA verification
exports.mfaValidation = [
  check('userId', 'User ID is required').not().isEmpty(),
  check('token', 'MFA Token is required').not().isEmpty().isLength({ min: 6, max: 10 })
];

// Validation for user registration
exports.userValidation = [
  check('name', 'Name is required').not().isEmpty(),
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
  check('role', 'Role is required').not().isEmpty().isIn(['admin', 'employee'])
];

// Validation for employee creation
exports.employeeValidation = [
  check('first_name', 'First name is required').not().isEmpty(),
  check('last_name', 'Last name is required').not().isEmpty(),
  check('email', 'Please include a valid email').optional().isEmail(),
  check('employee_type', 'Employee type must be salary, hourly, or private_duty_nurse').isIn(['salary', 'hourly', 'private_duty_nurse']),
  check('salary_amount', 'Salary must be a valid number').isNumeric(),
  check('hourly_rate', 'Hourly rate must be a valid number').optional().isNumeric(),
  check('standard_hours', 'Standard hours must be a valid number').optional().isNumeric(),
  check('payment_frequency', 'Payment frequency must be Monthly, Bi-Weekly, or Semi-Monthly').isIn(['Monthly', 'Bi-Weekly', 'Semi-Monthly']),
  check('date_of_birth', 'Date of birth must be a valid date').optional().isDate(),
  check('is_exempt_ss', 'Social Security exemption must be a boolean').optional().isBoolean(),
  check('is_exempt_medical', 'Medical benefits exemption must be a boolean').optional().isBoolean(),
  check('department_id', 'Department ID is required').not().isEmpty().isNumeric(),
  check('status', 'Status must be active or inactive').optional().isIn(['active', 'inactive'])
];

// Validation for employee update (less strict than creation)
exports.employeeUpdateValidation = [
  check('first_name', 'First name must be a string').optional().isString(),
  check('last_name', 'Last name must be a string').optional().isString(),
  check('email', 'Please include a valid email').optional().isEmail(),
  check('employee_type', 'Employee type must be salary, hourly, or private_duty_nurse').optional().isIn(['salary', 'hourly', 'private_duty_nurse']),
  check('salary_amount', 'Salary must be a valid number').optional().isNumeric(),
  check('hourly_rate', 'Hourly rate must be a valid number').optional().isNumeric(),
  check('standard_hours', 'Standard hours must be a valid number').optional().isNumeric(),
  check('payment_frequency', 'Payment frequency must be Monthly, Bi-Weekly, or Semi-Monthly').optional().isIn(['Monthly', 'Bi-Weekly', 'Semi-Monthly']),
  check('date_of_birth', 'Date of birth must be a valid date').optional().isDate(),
  check('is_exempt_ss', 'Social Security exemption must be a boolean').optional().isBoolean(),
  check('is_exempt_medical', 'Medical benefits exemption must be a boolean').optional().isBoolean(),
  check('department_id', 'Department ID must be a number').optional().isNumeric(),
  check('status', 'Status must be active or inactive').optional().isIn(['active', 'inactive'])
];

// Validation for vacation entry
exports.validateVacationEntry = [
  check('employee_id', 'Employee ID is required').not().isEmpty(),
  check('start_date', 'Start date must be a valid date').isDate(),
  check('end_date', 'End date must be a valid date').isDate(),
  check('total_hours', 'Total hours must be a valid number').isNumeric(),
  check('hourly_rate', 'Hourly rate must be a valid number').optional().isNumeric(),
  check('status', 'Status must be pending, approved, or cancelled').optional().isIn(['pending', 'approved', 'cancelled'])
];

// Validation for department creation
exports.departmentValidation = [
  check('name', 'Department name is required').not().isEmpty(),
  check('code', 'Department code must be a string').optional().isString(),
  check('description', 'Description must be a string').optional().isString()
];

// Validation for department update
exports.departmentUpdateValidation = [
  check('name', 'Department name is required').not().isEmpty(),
  check('code', 'Department code must be a string').optional().isString(),
  check('description', 'Description must be a string').optional().isString()
];

// Validation for banking information creation
exports.bankingInfoValidation = [
  check('bank_name', 'Bank name is required').not().isEmpty(),
  check('account_type', 'Account type must be Checking or Savings').isIn(['Checking', 'Savings']),
  check('account_number', 'Account number is required').not().isEmpty().isString(),
  check('routing_number', 'Routing number is required').not().isEmpty().isString(),
  check('is_primary', 'Primary flag must be a boolean').optional().isBoolean(),
  check('direct_deposit_enabled', 'Direct deposit flag must be a boolean').optional().isBoolean()
];

// Validation for banking information update
exports.bankingInfoUpdateValidation = [
  check('bank_name', 'Bank name must be a string').optional().isString(),
  check('account_type', 'Account type must be Checking or Savings').optional().isIn(['Checking', 'Savings']),
  check('account_number', 'Account number must be a string').optional().isString(),
  check('routing_number', 'Routing number must be a string').optional().isString(),
  check('is_primary', 'Primary flag must be a boolean').optional().isBoolean(),
  check('is_active', 'Active flag must be a boolean').optional().isBoolean(),
  check('direct_deposit_enabled', 'Direct deposit flag must be a boolean').optional().isBoolean()
];

// Middleware to validate request
exports.validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  next();
};
