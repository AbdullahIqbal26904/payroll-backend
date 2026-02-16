const EmployeeLeave = require('../models/EmployeeLeave');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Create a new leave entry
 * @route   POST /api/leaves
 * @access  Private/Admin
 */
exports.createLeave = async (req, res) => {
  try {
    const leaveData = req.body;
    const userId = req.user.id;
    
    if (!leaveData.employee_id || !leaveData.start_date || !leaveData.end_date || !leaveData.leave_type) {
      return res.status(400).json(formatError('Missing required fields. Please provide employee_id, start_date, end_date, and leave_type'));
    }
    
    // Validate leave_type
    const validLeaveTypes = ['maternity', 'compassionate', 'uncertified_sick', 'certified_sick'];
    if (!validLeaveTypes.includes(leaveData.leave_type)) {
      return res.status(400).json(formatError('Invalid leave type. Must be one of: maternity, compassionate, uncertified_sick, certified_sick'));
    }
    
    const leave = await EmployeeLeave.create(leaveData, userId);
    
    return res.status(201).json(formatSuccess('Leave entry created successfully', leave));
  } catch (error) {
    console.error('Error creating leave entry:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update a leave entry
 * @route   PUT /api/leaves/:id
 * @access  Private/Admin
 */
exports.updateLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const leaveData = req.body;
    
    // Validate leave_type if provided
    const validLeaveTypes = ['maternity', 'compassionate', 'uncertified_sick', 'certified_sick'];
    if (leaveData.leave_type && !validLeaveTypes.includes(leaveData.leave_type)) {
      return res.status(400).json(formatError('Invalid leave type. Must be one of: maternity, compassionate, uncertified_sick, certified_sick'));
    }
    
    // Validate payment_percentage if provided (should be between 0 and 100)
    if (leaveData.payment_percentage !== undefined) {
      const percentage = parseFloat(leaveData.payment_percentage);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return res.status(400).json(formatError('Payment percentage must be between 0 and 100'));
      }
    }
    
    const updatedLeave = await EmployeeLeave.update(id, leaveData);
    
    return res.status(200).json(formatSuccess('Leave entry updated successfully', updatedLeave));
  } catch (error) {
    console.error('Error updating leave entry:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete a leave entry
 * @route   DELETE /api/leaves/:id
 * @access  Private/Admin
 */
exports.deleteLeave = async (req, res) => {
  try {
    const { id } = req.params;
    
    await EmployeeLeave.delete(id);
    
    return res.status(200).json(formatSuccess('Leave entry deleted successfully'));
  } catch (error) {
    console.error('Error deleting leave entry:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get a single leave entry
 * @route   GET /api/leaves/:id
 * @access  Private/Admin
 */
exports.getLeave = async (req, res) => {
  try {
    const { id } = req.params;
    
    const leave = await EmployeeLeave.getById(id);
    
    return res.status(200).json(formatSuccess('Leave entry retrieved successfully', leave));
  } catch (error) {
    console.error('Error retrieving leave entry:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all leave entries with optional filtering
 * @route   GET /api/leaves
 * @access  Private/Admin
 */
exports.getLeaves = async (req, res) => {
  try {
    // Extract filter parameters from query string
    const filters = {};
    if (req.query.employee_id) filters.employee_id = req.query.employee_id;
    if (req.query.leave_type) filters.leave_type = req.query.leave_type;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.start_date) filters.start_date = req.query.start_date;
    if (req.query.end_date) filters.end_date = req.query.end_date;
    
    const leaves = await EmployeeLeave.getAll(filters);
    
    return res.status(200).json(formatSuccess('Leave entries retrieved successfully', leaves));
  } catch (error) {
    console.error('Error retrieving leave entries:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all leave entries for a specific employee
 * @route   GET /api/leaves/employee/:employeeId
 * @access  Private/Admin
 */
exports.getEmployeeLeaves = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const leaves = await EmployeeLeave.getByEmployeeId(employeeId);
    
    return res.status(200).json(formatSuccess(`Leave entries for employee ${employeeId} retrieved successfully`, leaves));
  } catch (error) {
    console.error('Error retrieving employee leave entries:', error);
    return res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Approve or reject a leave entry
 * @route   PATCH /api/leaves/:id/status
 * @access  Private/Admin
 */
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['pending', 'approved', 'cancelled'].includes(status)) {
      return res.status(400).json(formatError('Invalid status. Must be "pending", "approved", or "cancelled"'));
    }
    
    const updatedLeave = await EmployeeLeave.update(id, { status });
    
    return res.status(200).json(formatSuccess(`Leave status updated to ${status} successfully`, updatedLeave));
  } catch (error) {
    console.error('Error updating leave status:', error);
    return res.status(500).json(formatError(error));
  }
};