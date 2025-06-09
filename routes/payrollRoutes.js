const express = require('express');
const {
  uploadTimesheet,
  calculatePayroll,
  getPayrollReports,
  emailPaystubs,
  upload
} = require('../controllers/payrollController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// These routes will be implemented in Phase 2
router.post('/upload-timesheet', upload.single('file'), uploadTimesheet);
router.post('/calculate', calculatePayroll);
router.get('/reports', getPayrollReports);
router.post('/email-paystubs', emailPaystubs);

module.exports = router;
