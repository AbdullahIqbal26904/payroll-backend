const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middlewares/auth');
const auditMiddleware = require('../middlewares/audit');
const { protect, authorize, auditLogger } = require('../middlewares/auth');

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get dashboard summary metrics
 * @access  Private
 */
router.get('/dashboard', 
  authMiddleware.protect,
  AnalyticsController.getDashboardSummary
);

/**
 * @route   GET /api/analytics/payroll/trends
 * @desc    Get payroll trend analysis data
 * @access  Private
 */
router.get('/payroll/trends', 
  authMiddleware.protect,
  AnalyticsController.getPayrollTrends
);

/**
 * @route   GET /api/analytics/employees
 * @desc    Get employee analytics data
 * @access  Private
 */
router.get('/employees', 
  authMiddleware.protect,
  AnalyticsController.getEmployeeAnalytics
);

/**
 * @route   GET /api/analytics/deductions
 * @desc    Get deductions analytics data
 * @access  Private
 */
router.get('/deductions', 
  authMiddleware.protect,
  AnalyticsController.getDeductionsAnalytics
);

/**
 * @route   GET /api/analytics/leave-holiday
 * @desc    Get leave and holiday analytics data
 * @access  Private
 */
router.get('/leave-holiday', 
  authMiddleware.protect,
  AnalyticsController.getLeaveHolidayAnalytics
);

module.exports = router;