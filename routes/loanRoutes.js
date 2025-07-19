const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const {
  getAllLoans,
  getLoanById,
  createLoan,
  updateLoan,
  createThirdPartyLoan,
  getThirdPartyPayments
} = require('../controllers/loanController');

// All routes are protected and require admin access
router.use(protect);
router.use(authorize('admin'));

// Loan routes
router.route('/')
  .get(getAllLoans)
  .post(createLoan);

router.route('/:id')
  .get(getLoanById)
  .put(updateLoan);

// Third-party loan specific routes
router.route('/third-party')
  .post(createThirdPartyLoan);

router.route('/third-party-payments/:payrollRunId')
  .get(getThirdPartyPayments);

module.exports = router;
