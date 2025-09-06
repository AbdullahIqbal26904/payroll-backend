const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const { protect, authorize } = require('../middlewares/auth');

// Routes for holiday management
router.post('/', protect, authorize('admin'), holidayController.addHoliday);
router.get('/', protect, holidayController.getAllHolidays);

// Settings routes - specific routes before param routes
router.get('/settings', protect, authorize('admin'), holidayController.getHolidaySettings);
router.put('/settings', protect, authorize('admin'), holidayController.updateHolidaySettings);
router.get('/range', protect, holidayController.getHolidaysInRange);

// Routes with parameters should come after specific routes
router.put('/:id', protect, authorize('admin'), holidayController.updateHoliday);
router.delete('/:id', protect, authorize('admin'), holidayController.deleteHoliday);
router.get('/:id', protect, holidayController.getHolidayById);

module.exports = router;
