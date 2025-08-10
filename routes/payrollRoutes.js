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
  getDeductionsReport,
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
router.get('/deductions-report', getDeductionsReport);

// Paystub routes
// Download a paystub for a specific employee
router.get('/paystub/:payrollRunId/:employeeId', downloadPaystub);

// Email paystubs - supports two options via request body:
// 1. Send to all employees: { payrollRunId: "123", sendToAll: true }
// 2. Send to specific employees: { payrollRunId: "123", sendToAll: false, employeeIds: ["1", "2", "3"] }
router.post('/email-paystubs', emailPaystubs);

// Convenience route to email a paystub to a single employee
router.post('/email-paystub/:payrollRunId/:employeeId', async (req, res) => {
  // Set up the request body for a single employee
  req.body = {
    payrollRunId: req.params.payrollRunId,
    sendToAll: false,
    employeeIds: [req.params.employeeId]
  };
  // Call the main emailPaystubs function
  return await emailPaystubs(req, res);
});

// Settings routes
router.get('/settings', getPayrollSettings);
router.put('/settings', updatePayrollSettings);

module.exports = router;
