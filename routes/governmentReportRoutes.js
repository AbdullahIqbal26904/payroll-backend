/**
 * Government Reports Routes
 * API routes for generating government reports
 */

const express = require('express');
const router = express.Router();
const { protect, authorize, auditLogger } = require('../middlewares/auth');
const { validateRequest } = require('../middlewares/validator');

// const governmentReportController = require('../controllers/governmentReportController');
const {
    getReportSettings,
    updateReportSettings,
    validateSSN,
    generateGovernmentReport
} = require('../controllers/governmentReportController')

router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// @route   GET /api/reports/government/settings
// @desc    Get report number settings
// @access  Private/Admin
router.get('/settings', validateRequest, getReportSettings);

// @route   PUT /api/reports/government/settings
// @desc    Update report number settings
// @access  Private/Admin
router.put('/settings', validateRequest, updateReportSettings);

// @route   POST /api/reports/government/validate-ssn
// @desc    Validate SSN format
// @access  Private/Admin
router.post('/validate-ssn', validateRequest, validateSSN);

// @route   GET /api/reports/government/:type
// @desc    Generate a government report (PDF or JSON)
// @access  Private/Admin
// Note: This route must be last to avoid conflicts with other routes
router.get('/:type', validateRequest, generateGovernmentReport);

module.exports = router;
