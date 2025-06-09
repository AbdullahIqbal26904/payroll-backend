const express = require('express');
const { login, getMe, changePassword } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { loginValidation, validateRequest } = require('../middlewares/validator');

const router = express.Router();

// Public routes
router.post('/login', loginValidation, validateRequest, login);

// Protected routes
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
