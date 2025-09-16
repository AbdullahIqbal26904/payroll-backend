const express = require('express');
const router = express.Router();
const AuditController = require('../controllers/auditController');
const { protect } = require('../middlewares/auth');

// Protect all audit routes - only authenticated users with admin role
router.use(protect);
router.use((req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied: Admin role required to access audit logs'
    });
  }
});

// Get audit trail with pagination and filtering
router.get('/', AuditController.getAuditTrail);

// Get audit trail summary for dashboard
router.get('/summary', AuditController.getAuditSummary);

// Get distinct audit actions for filters
router.get('/actions', AuditController.getAuditActions);

// Get distinct audit entities for filters
router.get('/entities', AuditController.getAuditEntities);

// Get audit trail for a specific entity
router.get('/entity/:entity/:entityId', AuditController.getEntityAuditTrail);

module.exports = router;