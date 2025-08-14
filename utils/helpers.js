const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Format a date to MySQL format (YYYY-MM-DD)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
exports.formatDate = (date) => {
  if (!date) return null;
  
  const d = new Date(date);
  
  // Check if date is valid
  if (isNaN(d.getTime())) return null;
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Generate JWT token
 * @param {number} id - User ID
 * @param {string} role - User role
 * @param {string} [expiration] - Custom expiration time (overrides env setting)
 * @returns {string} JWT token
 */
exports.generateToken = (id, role, expiration = null) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: expiration || process.env.JWT_EXPIRE }
  );
};

/**
 * Format error response
 * @param {Error} error - Error object
 * @returns {Object} Formatted error object
 */
exports.formatError = (error) => {
  const formattedError = {
    message: error.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : error.stack
  };
  
  return formattedError;
};

/**
 * Format success response
 * @param {string} message - Success message
 * @param {*} data - Data to be returned
 * @returns {Object} Formatted success response
 */
exports.formatSuccess = (message, data = null) => {
  return {
    success: true,
    message,
    data
  };
};
