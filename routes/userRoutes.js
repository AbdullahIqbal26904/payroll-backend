const express = require('express');
const {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  resetPassword
} = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/auth');
const { userValidation, validateRequest } = require('../middlewares/validator');

const router = express.Router();

// Protect all routes
router.use(protect);
// Restrict all routes to admin only
router.use(authorize('admin'));

router
  .route('/')
  .get(getUsers)
  .post(userValidation, validateRequest, createUser);

router
  .route('/:id')
  .get(getUser)
  .put(updateUser)
  .delete(deleteUser);

router.post('/:id/reset-password', resetPassword);

module.exports = router;
