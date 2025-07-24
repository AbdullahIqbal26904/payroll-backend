const express = require('express');
const {
  createVacation,
  updateVacation,
  deleteVacation,
  getVacation,
  getVacations,
  getEmployeeVacations
} = require('../controllers/vacationController');
const { protect, authorize } = require('../middlewares/auth');
const { validateVacationEntry } = require('../middlewares/validator');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

// Vacation management routes
router.post('/', validateVacationEntry, createVacation);
router.put('/:id', validateVacationEntry, updateVacation);
router.delete('/:id', deleteVacation);
router.get('/:id', getVacation);
router.get('/', getVacations);
router.get('/employee/:employeeId', getEmployeeVacations);

module.exports = router;
