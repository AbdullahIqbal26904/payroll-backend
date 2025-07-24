const EmployeeVacation = require('../models/EmployeeVacation');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Create a new vacation entry
 * @route   POST /api/vacations
 * @access  Private/Admin
 */
exports.createVacation = async (req, res) => {
  try {
    const { employee_id, start_date, end_date, total_hours, hourly_rate, status } = req.body;
    
    // Validation
    if (!employee_id || !start_date || !end_date || !total_hours) {
      return res.status(400).json(
        formatError('Missing required fields: employee_id, start_date, end_date, total_hours')
      );
    }
    
    // Create vacation entry
    const vacation = await EmployeeVacation.create(
      { employee_id, start_date, end_date, total_hours, hourly_rate, status },
      req.user.id
    );
    
    res.status(201).json(formatSuccess('Vacation entry created successfully', { vacation }));
  } catch (error) {
    console.error('Error creating vacation entry:', error);
    res.status(500).json(formatError('Failed to create vacation entry', error));
  }
};

/**
 * @desc    Update a vacation entry
 * @route   PUT /api/vacations/:id
 * @access  Private/Admin
 */
exports.updateVacation = async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, total_hours, hourly_rate, status } = req.body;
    
    // Check if vacation exists
    const existingVacation = await EmployeeVacation.getById(id);
    if (!existingVacation) {
      return res.status(404).json(formatError('Vacation entry not found'));
    }
    
    // Update vacation
    const vacation = await EmployeeVacation.update(id, {
      start_date, end_date, total_hours, hourly_rate, status
    });
    
    res.json(formatSuccess('Vacation entry updated successfully', { vacation }));
  } catch (error) {
    console.error('Error updating vacation entry:', error);
    res.status(500).json(formatError('Failed to update vacation entry', error));
  }
};

/**
 * @desc    Delete a vacation entry
 * @route   DELETE /api/vacations/:id
 * @access  Private/Admin
 */
exports.deleteVacation = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if vacation exists
    const vacation = await EmployeeVacation.getById(id);
    if (!vacation) {
      return res.status(404).json(formatError('Vacation entry not found'));
    }
    
    // Delete vacation
    await EmployeeVacation.delete(id);
    
    res.json(formatSuccess('Vacation entry deleted successfully'));
  } catch (error) {
    console.error('Error deleting vacation entry:', error);
    res.status(500).json(formatError('Failed to delete vacation entry', error));
  }
};

/**
 * @desc    Get a specific vacation entry
 * @route   GET /api/vacations/:id
 * @access  Private/Admin
 */
exports.getVacation = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get vacation
    const vacation = await EmployeeVacation.getById(id);
    if (!vacation) {
      return res.status(404).json(formatError('Vacation entry not found'));
    }
    
    res.json(formatSuccess('Vacation entry retrieved successfully', { vacation }));
  } catch (error) {
    console.error('Error retrieving vacation entry:', error);
    res.status(500).json(formatError('Failed to retrieve vacation entry', error));
  }
};

/**
 * @desc    Get all vacation entries
 * @route   GET /api/vacations
 * @access  Private/Admin
 */
exports.getVacations = async (req, res) => {
  try {
    // Apply filters from query parameters
    const filters = {};
    
    if (req.query.employee_id) {
      filters.employee_id = req.query.employee_id;
    }
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    
    if (req.query.start_date) {
      filters.start_date = req.query.start_date;
    }
    
    if (req.query.end_date) {
      filters.end_date = req.query.end_date;
    }
    
    // Get vacations
    const vacations = await EmployeeVacation.getAll(filters);
    
    res.json(formatSuccess('Vacation entries retrieved successfully', { 
      count: vacations.length,
      vacations 
    }));
  } catch (error) {
    console.error('Error retrieving vacation entries:', error);
    res.status(500).json(formatError('Failed to retrieve vacation entries', error));
  }
};

/**
 * @desc    Get vacation entries for a specific employee
 * @route   GET /api/vacations/employee/:employeeId
 * @access  Private/Admin
 */
exports.getEmployeeVacations = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Get employee vacations
    const vacations = await EmployeeVacation.getByEmployeeId(employeeId);
    
    res.json(formatSuccess('Employee vacation entries retrieved successfully', { 
      count: vacations.length,
      vacations 
    }));
  } catch (error) {
    console.error('Error retrieving employee vacation entries:', error);
    res.status(500).json(formatError('Failed to retrieve employee vacation entries', error));
  }
};
