const express = require('express');
const {
  createLeave,
  updateLeave,
  deleteLeave,
  getLeave,
  getLeaves,
  getEmployeeLeaves,
  updateLeaveStatus
} = require('../controllers/leaveController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// Leave management routes
router.post('/', createLeave);
router.put('/:id', updateLeave);
router.delete('/:id', deleteLeave);
router.get('/:id', getLeave);
router.get('/', getLeaves);
router.get('/employee/:employeeId', getEmployeeLeaves);
router.patch('/:id/status', updateLeaveStatus);

module.exports = router;