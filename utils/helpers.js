const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Generate JWT token
 * @param {number} id - User ID
 * @param {string} role - User role
 * @returns {string} JWT token
 */
exports.generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
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
