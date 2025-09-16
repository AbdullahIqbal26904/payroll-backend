const express = require('express');
const {
  addEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  toggleArchiveEmployee
} = require('../controllers/employeeController');
const { getEmployeeLoans } = require('../controllers/loanController');
const { protect, authorize, auditLogger } = require('../middlewares/auth');
const { employeeValidation, employeeUpdateValidation, validateRequest } = require('../middlewares/validator');

// Import banking routes
const bankingRoutes = require('./bankingRoutes');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

router
  .route('/')
  .get(getEmployees)
  .post(employeeValidation, validateRequest, addEmployee);

router
  .route('/:id')
  .get(getEmployee)
  .put(employeeUpdateValidation, validateRequest, updateEmployee)
  .delete(deleteEmployee);

// Route for getting employee loans
router.route('/:id/loans').get(getEmployeeLoans);

// Route for archiving/unarchiving an employee
router.route('/:id/archive').patch(toggleArchiveEmployee);

// Mount banking routes
router.use('/:id/banking', bankingRoutes);

module.exports = router;
