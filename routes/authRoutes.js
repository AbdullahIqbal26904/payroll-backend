const express = require('express');
const { 
  login, 
  getMe, 
  changePassword, 
  verifyMFA, 
  setupMFA, 
  verifyAndEnableMFA, 
  disableMFA, 
  generateNewBackupCodes,
  setupEmailMFA,
  verifyAndEnableEmailMFA,
  disableEmailMFA,
  sendMfaCode,
  verifyEmailMfaLogin,
  getMfaStatus
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { loginValidation, validateRequest, mfaValidation } = require('../middlewares/validator');

const router = express.Router();

// Public routes
router.post('/login', loginValidation, validateRequest, login);

// MFA verification routes (with temporary token)
router.post('/verify-mfa', verifyMFA);
router.post('/verify-email-mfa-login', verifyEmailMfaLogin);
router.post('/send-mfa-code', sendMfaCode);

// Protected routes
router.get('/me', protect, getMe);
router.get('/mfa-status', protect, getMfaStatus);
router.put('/change-password', protect, changePassword);

// App-based MFA routes (all protected)
router.post('/setup-mfa', protect, setupMFA);
router.post('/verify-setup-mfa', protect, verifyAndEnableMFA);
router.post('/disable-mfa', protect, disableMFA);
router.post('/generate-backup-codes', protect, generateNewBackupCodes);

// Email-based MFA routes (all protected)
router.post('/setup-email-mfa', protect, setupEmailMFA);
router.post('/verify-email-mfa', protect, verifyAndEnableEmailMFA);
router.post('/disable-email-mfa', protect, disableEmailMFA);

module.exports = router;
