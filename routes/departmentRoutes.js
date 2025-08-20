/**
 * Department Routes
 * Handles routes related to departments
 */
const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { protect, authorize } = require('../middlewares/auth');
const { departmentValidation, departmentUpdateValidation, validateRequest } = require('../middlewares/validator');

// Get all departments - accessible to all authenticated users
router.get('/', protect, departmentController.getAllDepartments);

// Get department by ID - accessible to all authenticated users
router.get('/:id', protect, departmentController.getDepartmentById);

// Create a new department - admin only
router.post('/', protect, authorize('admin'), departmentValidation, validateRequest, departmentController.createDepartment);

// Update an existing department - admin only
router.put('/:id', protect, authorize('admin'), departmentUpdateValidation, validateRequest, departmentController.updateDepartment);

// Delete a department - admin only
router.delete('/:id', protect, authorize('admin'), departmentController.deleteDepartment);

module.exports = router;
