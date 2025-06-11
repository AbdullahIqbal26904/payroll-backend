const express = require('express');
const {
  calculatePayroll,
  getPayrollReports,
  getPayrollReport,
  getTimesheetPeriods,
  getTimesheetPeriod,
  downloadPaystub,
  emailPaystubs,
  getPayrollSettings,
  updatePayrollSettings,
  upload
} = require('../controllers/payrollController');
const { uploadTimesheet } = require('../controllers/timesheetController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// Timesheet routes
router.post('/upload-timesheet', upload.single('file'), uploadTimesheet);
router.get('/timesheet-periods', getTimesheetPeriods);
router.get('/timesheet-periods/:id', getTimesheetPeriod);

// Payroll calculation routes
router.post('/calculate', calculatePayroll);

// Payroll reports routes
router.get('/reports', getPayrollReports);
router.get('/reports/:id', getPayrollReport);

// Paystub routes
router.get('/paystub/:payrollRunId/:employeeId', downloadPaystub);
router.post('/email-paystubs', emailPaystubs);

// Settings routes
router.get('/settings', getPayrollSettings);
router.put('/settings', updatePayrollSettings);

module.exports = router;
