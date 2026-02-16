const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Atlantic Standard Time (AST) timezone identifier (GMT-4)
 */
const AST_TIMEZONE = 'America/Virgin';

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
 * Format a date for display in dd/mm/yyyy format.
 * Handles YYYY-MM-DD strings and Date objects safely without timezone shift.
 * For Date objects with time components (timestamps), uses AST timezone.
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string (dd/mm/yyyy)
 */
exports.formatDisplayDate = (date) => {
  if (!date) return 'N/A';
  
  // Handle YYYY-MM-DD strings directly (avoids UTC parse shift)
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
  }
  
  const d = new Date(date);
  
  // Check if date is valid
  if (isNaN(d.getTime())) return 'N/A';
  
  // For Date objects (e.g., from MySQL), format in AST timezone
  const day = d.toLocaleDateString('en-GB', { day: '2-digit', timeZone: AST_TIMEZONE });
  const month = d.toLocaleDateString('en-GB', { month: '2-digit', timeZone: AST_TIMEZONE });
  const year = d.toLocaleDateString('en-GB', { year: 'numeric', timeZone: AST_TIMEZONE });
  
  return `${day}/${month}/${year}`;
};

/**
 * Format a date for display with long month name (e.g., "16 February 2026")
 * Handles YYYY-MM-DD strings safely without timezone shift.
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
exports.formatDisplayDateLong = (date) => {
  if (!date) return 'N/A';
  
  // Handle YYYY-MM-DD strings directly to avoid UTC parse shift
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      // Create date at noon local time to avoid any day boundary issues
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0);
      if (!isNaN(d.getTime())) {
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
  }
  
  const d = new Date(date);
  
  if (isNaN(d.getTime())) return 'N/A';
  
  // For Date objects with time, use AST timezone
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: AST_TIMEZONE
  });
};

/**
 * Format a date range for display in dd/mm/yyyy format using AST
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {string} Formatted date range string
 */
exports.formatDisplayDateRange = (startDate, endDate) => {
  return `${exports.formatDisplayDate(startDate)} to ${exports.formatDisplayDate(endDate)}`;
};

/**
 * Format a date/time for display in dd/mm/yyyy HH:mm format using AST (GMT-4)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date/time string in AST
 */
exports.formatDisplayDateTime = (date) => {
  if (!date) return 'N/A';
  
  const d = new Date(date);
  
  if (isNaN(d.getTime())) return 'N/A';
  
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: AST_TIMEZONE
  });
};

/**
 * Format month-year for report headers (e.g., "Jul-25") using AST
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted month-year string
 */
exports.formatMonthYearShort = (date) => {
  if (!date) return 'N/A';
  
  // Handle YYYY-MM-DD strings directly to avoid UTC shift
  let d;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0);
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return 'N/A';
  
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const yearStr = String(d.getFullYear()).slice(-2);
  
  return `${months[d.getMonth()]}-${yearStr}`;
};

/**
 * Format month-year long for report headers (e.g., "July 2025") using AST
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted month-year string
 */
exports.formatMonthYearLong = (date) => {
  if (!date) return 'N/A';
  
  // Handle YYYY-MM-DD strings directly to avoid UTC shift
  let d;
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0);
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return 'N/A';
  
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Get current date/time in AST timezone
 * @returns {Date} Current date adjusted concept (note: JS Date is always UTC internally)
 */
exports.getCurrentAST = () => {
  return new Date();
};

/**
 * Get current date formatted for display in dd/mm/yyyy using AST
 * @returns {string} Current date in dd/mm/yyyy format in AST
 */
exports.getCurrentDisplayDate = () => {
  return exports.formatDisplayDate(new Date());
};

/**
 * AST timezone identifier exported for direct use
 */
exports.AST_TIMEZONE = AST_TIMEZONE;

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

/**
 * Calculate working days between two dates
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @returns {number} Number of working days (excluding weekends)
 */
exports.calculateWorkingDays = (startDate, endDate) => {
  // Convert to date objects
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Check if dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0;
  }
  
  // Clone the start date
  const current = new Date(start);
  let workingDays = 0;
  
  // Loop through each day and count if it's a weekday (Monday-Friday)
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
    
    // Move to the next day
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
};

/**
 * Calculate vacation hours based on working days and standard hours
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date
 * @param {number} standardDailyHours - Standard daily hours (default: 8)
 * @returns {number} Total vacation hours
 */
exports.calculateVacationHours = (startDate, endDate, standardDailyHours = 8) => {
  const workingDays = exports.calculateWorkingDays(startDate, endDate);
  return workingDays * standardDailyHours;
};
