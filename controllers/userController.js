const bcrypt = require('bcrypt');
const db = require('../config/db');
const { formatSuccess, formatError } = require('../utils/helpers');

/**
 * @desc    Create a new user
 * @route   POST /api/users
 * @access  Private/Admin
 */
exports.createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  
  try {
    // Check if user already exists
    const [existingUsers] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, role]
    );
    
    // Get created user
    const [newUser] = await db.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json(formatSuccess('User created successfully', newUser[0]));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private/Admin
 */
exports.getUsers = async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY id DESC'
    );
    
    res.status(200).json(formatSuccess('Users fetched successfully', users));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get single user
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
exports.getUser = async (req, res) => {
  try {
    const [user] = await db.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json(formatSuccess('User fetched successfully', user[0]));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
exports.updateUser = async (req, res) => {
  const { name, email, role } = req.body;
  
  try {
    // Check if user exists
    const [userRows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if email is already in use by another user
    if (email && email !== userRows[0].email) {
      const [emailCheck] = await db.query(
        'SELECT * FROM users WHERE email = ? AND id != ?',
        [email, req.params.id]
      );
      
      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use'
        });
      }
    }
    
    // Update user
    await db.query(
      'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
      [name, email, role, req.params.id]
    );
    
    // Get updated user
    const [updatedUser] = await db.query(
      'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = ?',
      [req.params.id]
    );
    
    res.status(200).json(formatSuccess('User updated successfully', updatedUser[0]));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = async (req, res) => {
  try {
    // Check if user exists
    const [user] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Prevent deleting self
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }
    
    // Delete user
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    res.status(200).json(formatSuccess('User deleted successfully'));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Reset user password
 * @route   POST /api/users/:id/reset-password
 * @access  Private/Admin
 */
exports.resetPassword = async (req, res) => {
  const { newPassword } = req.body;
  
  try {
    // Check if user exists
    const [user] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.params.id]
    );
    
    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await db.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.params.id]
    );
    
    res.status(200).json(formatSuccess('Password reset successfully'));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};
