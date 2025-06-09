const { check, validationResult } = require('express-validator');

// Validation for login request
exports.loginValidation = [
  check('email', 'Please include a valid email').isEmail(),
  check('password', 'Password is required').not().isEmpty()
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
  check('salary_amount', 'Salary must be a valid number').isNumeric(),
  check('payment_frequency', 'Payment frequency must be either Monthly or Bi-Weekly').isIn(['Monthly', 'Bi-Weekly']),
  check('date_of_birth', 'Date of birth must be a valid date').optional().isDate()
];

// Middleware to validate request
exports.validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  
  next();
};
