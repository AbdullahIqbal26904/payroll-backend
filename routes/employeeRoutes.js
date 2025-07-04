const express = require('express');
const {
  addEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee
} = require('../controllers/employeeController');
const { getEmployeeLoans } = require('../controllers/loanController');
const { protect, authorize, auditLogger } = require('../middlewares/auth');
const { employeeValidation, validateRequest } = require('../middlewares/validator');

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
  .put(updateEmployee)
  .delete(deleteEmployee);

// Employee loans route
router.route('/:id/loans')
  .get(getEmployeeLoans);

module.exports = router;
