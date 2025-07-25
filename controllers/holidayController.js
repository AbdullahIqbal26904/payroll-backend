const PublicHoliday = require('../models/PublicHoliday');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Add a new public holiday
 * @route   POST /api/holidays
 * @access  Private/Admin
 */
exports.addHoliday = async (req, res) => {
  try {
    const { name, date, description } = req.body;
    
    // Validate required fields
    if (!name || !date) {
      return res.status(400).json(formatError({
        message: 'Holiday name and date are required'
      }));
    }
    
    const holiday = await PublicHoliday.addHoliday(
      { name, date, description },
      req.user.id
    );
    
    return res.status(201).json(formatSuccess('Public holiday added successfully', holiday));
  } catch (error) {
    console.error('Error adding public holiday:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update a public holiday
 * @route   PUT /api/holidays/:id
 * @access  Private/Admin
 */
exports.updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, description } = req.body;
    
    // Check if holiday exists
    const holiday = await PublicHoliday.getHolidayById(id);
    
    if (!holiday) {
      return res.status(404).json(formatError({
        message: 'Public holiday not found'
      }));
    }
    
    const updated = await PublicHoliday.updateHoliday(id, { name, date, description });
    
    if (!updated) {
      return res.status(400).json(formatError({
        message: 'No changes provided'
      }));
    }
    
    const updatedHoliday = await PublicHoliday.getHolidayById(id);
    
    return res.status(200).json(formatSuccess('Public holiday updated successfully', updatedHoliday));
  } catch (error) {
    console.error('Error updating public holiday:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete a public holiday
 * @route   DELETE /api/holidays/:id
 * @access  Private/Admin
 */
exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if holiday exists
    const holiday = await PublicHoliday.getHolidayById(id);
    
    if (!holiday) {
      return res.status(404).json(formatError({
        message: 'Public holiday not found'
      }));
    }
    
    await PublicHoliday.deleteHoliday(id);
    
    return res.status(200).json(formatSuccess('Public holiday deleted successfully'));
  } catch (error) {
    console.error('Error deleting public holiday:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all public holidays
 * @route   GET /api/holidays
 * @access  Private/Admin
 */
exports.getAllHolidays = async (req, res) => {
  try {
    const { year, startDate, endDate, limit, page = 1 } = req.query;
    const offset = (page - 1) * (limit || 100);
    
    const holidays = await PublicHoliday.getAllHolidays({
      year: year ? parseInt(year) : undefined,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : undefined,
      offset
    });
    
    return res.status(200).json(formatSuccess('Public holidays retrieved successfully', holidays));
  } catch (error) {
    console.error('Error retrieving public holidays:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get a public holiday by ID
 * @route   GET /api/holidays/:id
 * @access  Private/Admin
 */
exports.getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const holiday = await PublicHoliday.getHolidayById(id);
    
    if (!holiday) {
      return res.status(404).json(formatError({
        message: 'Public holiday not found'
      }));
    }
    
    return res.status(200).json(formatSuccess('Public holiday retrieved successfully', holiday));
  } catch (error) {
    console.error('Error retrieving public holiday:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get holidays in a date range
 * @route   GET /api/holidays/range
 * @access  Private
 */
exports.getHolidaysInRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json(formatError({
        message: 'Start date and end date are required'
      }));
    }
    
    const holidays = await PublicHoliday.getHolidaysInRange(startDate, endDate);
    
    return res.status(200).json(formatSuccess('Holidays in range retrieved successfully', holidays));
  } catch (error) {
    console.error('Error retrieving holidays in range:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get holiday pay enabled status
 * @route   GET /api/holidays/settings
 * @access  Private/Admin
 */
exports.getHolidaySettings = async (req, res) => {
  try {
    const isEnabled = await PublicHoliday.isHolidayPayEnabled();
    
    return res.status(200).json(formatSuccess('Holiday settings retrieved successfully', {
      paid_holidays_enabled: isEnabled
    }));
  } catch (error) {
    console.error('Error retrieving holiday settings:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update holiday pay enabled status
 * @route   PUT /api/holidays/settings
 * @access  Private/Admin
 */
exports.updateHolidaySettings = async (req, res) => {
  try {
    const { paid_holidays_enabled } = req.body;
    
    if (paid_holidays_enabled === undefined) {
      return res.status(400).json(formatError({
        message: 'paid_holidays_enabled field is required'
      }));
    }
    
    await PublicHoliday.setHolidayPayEnabled(paid_holidays_enabled);
    
    return res.status(200).json(formatSuccess('Holiday settings updated successfully', {
      paid_holidays_enabled
    }));
  } catch (error) {
    console.error('Error updating holiday settings:', error);
    return res.status(500).json(formatError(error));
  }
};
