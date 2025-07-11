const express = require('express');
const router = express.Router();
const VacationEntitlement = require('../models/VacationEntitlement');
const { formatSuccess, formatError } = require('../utils/helpers');
const { protect: auth } = require('../middlewares/auth');

/**
 * @desc    Get vacation summary for an employee
 * @route   GET /api/vacation/summary/:employeeId
 * @access  Private
 */
router.get('/summary/:employeeId', auth, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;
    
    // Check if user can access this employee's data
    if (req.user.role !== 'admin' && req.user.employee_id !== employeeId) {
      return res.status(403).json(formatError({ message: 'Access denied' }));
    }
    
    const summary = await VacationEntitlement.getVacationSummary(employeeId, year);
    
    res.status(200).json(formatSuccess('Vacation summary retrieved successfully', summary));
  } catch (error) {
    console.error('Error retrieving vacation summary:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Initialize vacation entitlement for an employee
 * @route   POST /api/vacation/initialize
 * @access  Private/Admin
 */
router.post('/initialize', auth, async (req, res) => {
  try {
    // Only admins can initialize vacation entitlements
    if (req.user.role !== 'admin') {
      return res.status(403).json(formatError({ message: 'Admin access required' }));
    }
    
    const { employeeId, year, annualPtoHours } = req.body;
    
    if (!employeeId || !year || annualPtoHours === undefined) {
      return res.status(400).json(formatError({ 
        message: 'Employee ID, year, and annual PTO hours are required' 
      }));
    }
    
    const entitlement = await VacationEntitlement.initializeEntitlement(
      employeeId, 
      parseInt(year), 
      parseFloat(annualPtoHours)
    );
    
    res.status(201).json(formatSuccess('Vacation entitlement initialized successfully', entitlement));
  } catch (error) {
    console.error('Error initializing vacation entitlement:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Create a vacation request
 * @route   POST /api/vacation/request
 * @access  Private
 */
router.post('/request', auth, async (req, res) => {
  try {
    const { employeeId, startDate, endDate, totalHours, notes } = req.body;
    
    // Check if user can create requests for this employee
    if (req.user.role !== 'admin' && req.user.employee_id !== employeeId) {
      return res.status(403).json(formatError({ message: 'Access denied' }));
    }
    
    if (!employeeId || !startDate || !endDate || !totalHours) {
      return res.status(400).json(formatError({ 
        message: 'Employee ID, start date, end date, and total hours are required' 
      }));
    }
    
    // Check if employee has sufficient vacation balance
    const summary = await VacationEntitlement.getVacationSummary(employeeId);
    if (summary.availableBalance < totalHours) {
      return res.status(400).json(formatError({ 
        message: `Insufficient vacation balance. Available: ${summary.availableBalance} hours, Requested: ${totalHours} hours` 
      }));
    }
    
    const request = await VacationEntitlement.createVacationRequest({
      employeeId,
      startDate,
      endDate,
      totalHours: parseFloat(totalHours),
      notes
    });
    
    res.status(201).json(formatSuccess('Vacation request created successfully', request));
  } catch (error) {
    console.error('Error creating vacation request:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Get vacation requests for an employee
 * @route   GET /api/vacation/requests/:employeeId
 * @access  Private
 */
router.get('/requests/:employeeId', auth, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { limit = 10, page = 1, status } = req.query;
    const offset = (page - 1) * limit;
    
    // Check if user can access this employee's data
    if (req.user.role !== 'admin' && req.user.employee_id !== employeeId) {
      return res.status(403).json(formatError({ message: 'Access denied' }));
    }
    
    const requests = await VacationEntitlement.getVacationRequestsByEmployee(
      employeeId, 
      { limit: parseInt(limit), offset, status }
    );
    
    res.status(200).json(formatSuccess('Vacation requests retrieved successfully', requests));
  } catch (error) {
    console.error('Error retrieving vacation requests:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Get all vacation requests (admin only)
 * @route   GET /api/vacation/requests
 * @access  Private/Admin
 */
router.get('/requests', auth, async (req, res) => {
  try {
    // Only admins can view all vacation requests
    if (req.user.role !== 'admin') {
      return res.status(403).json(formatError({ message: 'Admin access required' }));
    }
    
    const { limit = 20, page = 1, status } = req.query;
    const offset = (page - 1) * limit;
    
    const requests = await VacationEntitlement.getAllVacationRequests({
      limit: parseInt(limit), 
      offset, 
      status
    });
    
    res.status(200).json(formatSuccess('All vacation requests retrieved successfully', requests));
  } catch (error) {
    console.error('Error retrieving all vacation requests:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Approve or deny a vacation request
 * @route   PUT /api/vacation/requests/:requestId/status
 * @access  Private/Admin
 */
router.put('/requests/:requestId/status', auth, async (req, res) => {
  try {
    // Only admins can approve/deny vacation requests
    if (req.user.role !== 'admin') {
      return res.status(403).json(formatError({ message: 'Admin access required' }));
    }
    
    const { requestId } = req.params;
    const { status } = req.body;
    
    if (!['approved', 'denied'].includes(status)) {
      return res.status(400).json(formatError({ 
        message: 'Status must be either "approved" or "denied"' 
      }));
    }
    
    const updatedRequest = await VacationEntitlement.updateVacationRequestStatus(
      parseInt(requestId), 
      status, 
      req.user.id
    );
    
    res.status(200).json(formatSuccess('Vacation request status updated successfully', updatedRequest));
  } catch (error) {
    console.error('Error updating vacation request status:', error);
    res.status(500).json(formatError(error));
  }
});

/**
 * @desc    Get vacation request by ID
 * @route   GET /api/vacation/requests/detail/:requestId
 * @access  Private
 */
router.get('/requests/detail/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const request = await VacationEntitlement.getVacationRequestById(parseInt(requestId));
    
    if (!request) {
      return res.status(404).json(formatError({ message: 'Vacation request not found' }));
    }
    
    // Check if user can access this request
    if (req.user.role !== 'admin' && req.user.employee_id !== request.employee_id) {
      return res.status(403).json(formatError({ message: 'Access denied' }));
    }
    
    res.status(200).json(formatSuccess('Vacation request retrieved successfully', request));
  } catch (error) {
    console.error('Error retrieving vacation request:', error);
    res.status(500).json(formatError(error));
  }
});

module.exports = router;
