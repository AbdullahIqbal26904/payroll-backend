const express = require('express');
const {
  getLoans,
  getLoanById,
  createLoan,
  updateLoan
} = require('../controllers/loanController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// Loan routes
router.route('/')
  .get(getLoans)
  .post(createLoan);

router.route('/:id')
  .get(getLoanById)
  .put(updateLoan);

module.exports = router;
