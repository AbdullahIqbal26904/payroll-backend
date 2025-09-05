const express = require('express');
const {
  addBankingInfo,
  getBankingInfo,
  getBankingInfoById,
  updateBankingInfo,
  deleteBankingInfo
} = require('../controllers/bankingController');
const { protect, authorize, auditLogger } = require('../middlewares/auth');
const { bankingInfoValidation, bankingInfoUpdateValidation, validateRequest } = require('../middlewares/validator');

// Create router for banking routes
const router = express.Router({ mergeParams: true });

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// Add audit logging to sensitive operations
const auditBankingChanges = auditLogger('Banking Information');

// Routes for employee banking information
router.route('/')
  .get(getBankingInfo)
  .post(bankingInfoValidation, validateRequest, auditBankingChanges, addBankingInfo);

router.route('/:bankingId')
  .get(getBankingInfoById)
  .put(bankingInfoUpdateValidation, validateRequest, auditBankingChanges, updateBankingInfo)
  .delete(auditBankingChanges, deleteBankingInfo);

module.exports = router;
