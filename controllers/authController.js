const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { generateToken, formatSuccess, formatError } = require('../utils/helpers');
const { verifyToken, verifyBackupCode, generateEmailCode, sendMfaCodeByEmail } = require('../utils/mfaUtils');

/**
 * @desc    Get MFA status for a user
 * @route   GET /api/auth/mfa-status
 * @access  Private
 */
exports.getMfaStatus = async (req, res) => {
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT mfa_enabled, email_mfa_enabled FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Return MFA status
    res.status(200).json(formatSuccess('MFA status retrieved successfully', {
      appMfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true,
      emailMfaEnabled: user.email_mfa_enabled === 1 || user.email_mfa_enabled === true,
      anyMfaEnabled: (user.mfa_enabled === 1 || user.mfa_enabled === true) || 
                    (user.email_mfa_enabled === 1 || user.email_mfa_enabled === true)
    }));
  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Login user - first step
 * @route   POST /api/auth/login
 * @access  Public
 */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Find user by email
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    // Check if user exists
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const user = rows[0];
    
    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if any type of MFA is enabled
    if (user.mfa_enabled || user.email_mfa_enabled) {
      // Return a temporary token for MFA verification
      const tempToken = jwt.sign(
        { id: user.id, role: user.role, isMfaVerified: false },
        process.env.JWT_SECRET,
        { expiresIn: '10m' } // 10 minutes expiry
      );
      
      return res.status(200).json(formatSuccess('MFA verification required', {
        requireMFA: true,
        mfaType: user.mfa_enabled ? 'app' : 'email',
        tempToken,
        userId: user.id
      }));
    }
    
    // If MFA is not enabled, generate regular JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role, isMfaVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    // Send response
    res.status(200).json(formatSuccess('Login successful', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: user.mfa_enabled,
      token
    }));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get current logged in user
 * @route   GET /api/auth/me
 * @access  Private
 */
exports.getMe = async (req, res) => {
  try {
    // Get complete user details including MFA status
    const [rows] = await db.query(
      'SELECT id, name, email, role, mfa_enabled FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    res.status(200).json(formatSuccess('User fetched successfully', user));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/auth/change-password
 * @access  Private
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password in database
    await db.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );
    
    res.status(200).json(formatSuccess('Password updated successfully'));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Verify MFA token
 * @route   POST /api/auth/verify-mfa
 * @access  Public (with temp token)
 */
exports.verifyMFA = async (req, res) => {
  const { userId, token, useBackupCode } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    let isValid = false;
    let updatedBackupCodes = null;
    
    if (useBackupCode) {
      // Verify backup code
      const backupCodes = JSON.parse(user.mfa_backup_codes || '[]');
      const result = verifyBackupCode(token, backupCodes);
      isValid = result.isValid;
      updatedBackupCodes = result.remainingCodes;
      
      // Update backup codes in the database if a valid code was used
      if (isValid) {
        await db.query(
          'UPDATE users SET mfa_backup_codes = ? WHERE id = ?',
          [JSON.stringify(updatedBackupCodes), userId]
        );
      }
    } else {
      // Verify TOTP token
      isValid = verifyToken(token, user.mfa_secret);
    }
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: useBackupCode ? 'Invalid backup code' : 'Invalid MFA code'
      });
    }
    
    // Generate full JWT token with MFA verification flag
    const fullToken = jwt.sign(
      { id: user.id, role: user.role, isMfaVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    // Send response
    res.status(200).json(formatSuccess('MFA verification successful', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: true,
      token: fullToken
    }));
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Setup MFA for a user
 * @route   POST /api/auth/setup-mfa
 * @access  Private
 */
exports.setupMFA = async (req, res) => {
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Check if any type of MFA is already enabled
    if (user.mfa_enabled || user.email_mfa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is already enabled for this user. Please disable existing MFA before setting up a new one.'
      });
    }
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate new secret
    const secret = require('../utils/mfaUtils').generateSecret(user.email);
    
    // Generate QR code
    const qrCode = await require('../utils/mfaUtils').generateQRCode(secret);
    
    // Generate backup codes
    const backupCodes = require('../utils/mfaUtils').generateBackupCodes();
    
    // Store the secret temporarily in the session/cache
    // For this example, we'll store it directly in the database
    // In production, you might want to use a temporary storage until verified
    await db.query(
      'UPDATE users SET mfa_secret = ?, mfa_backup_codes = ? WHERE id = ?',
      [secret.base32, JSON.stringify(backupCodes), req.user.id]
    );
    
    // Send response with QR code and other details
    res.status(200).json(formatSuccess('MFA setup initiated', {
      qrCode,
      secret: secret.base32, // Send to client for manual entry if needed
      backupCodes
    }));
  } catch (error) {
    console.error('MFA setup error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Verify and enable MFA
 * @route   POST /api/auth/verify-setup-mfa
 * @access  Private
 */
exports.verifyAndEnableMFA = async (req, res) => {
  const { token } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Verify the token against the stored secret
    const isValid = verifyToken(token, user.mfa_secret);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid MFA code'
      });
    }
    
    // Enable MFA
    await db.query(
      'UPDATE users SET mfa_enabled = true WHERE id = ?',
      [req.user.id]
    );
    
    // Send response
    res.status(200).json(formatSuccess('MFA enabled successfully'));
  } catch (error) {
    console.error('MFA verification error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Disable MFA
 * @route   POST /api/auth/disable-mfa
 * @access  Private
 */
exports.disableMFA = async (req, res) => {
  const { password } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Disable MFA
    await db.query(
      'UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = ?',
      [req.user.id]
    );
    
    // Send response
    res.status(200).json(formatSuccess('MFA disabled successfully'));
  } catch (error) {
    console.error('MFA disable error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get MFA status for a user
 * @route   GET /api/auth/mfa-status
 * @access  Private
 */
exports.getMfaStatus = async (req, res) => {
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT mfa_enabled, email_mfa_enabled FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Return MFA status
    res.status(200).json(formatSuccess('MFA status retrieved successfully', {
      appMfaEnabled: user.mfa_enabled === 1 || user.mfa_enabled === true,
      emailMfaEnabled: user.email_mfa_enabled === 1 || user.email_mfa_enabled === true,
      anyMfaEnabled: (user.mfa_enabled === 1 || user.mfa_enabled === true) || 
                    (user.email_mfa_enabled === 1 || user.email_mfa_enabled === true)
    }));
  } catch (error) {
    console.error('Get MFA status error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Generate new backup codes
 * @route   POST /api/auth/generate-backup-codes
 * @access  Private
 */
exports.generateNewBackupCodes = async (req, res) => {
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if MFA is enabled
    if (!rows[0].mfa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is not enabled for this user'
      });
    }
    
    // Generate new backup codes
    const backupCodes = require('../utils/mfaUtils').generateBackupCodes();
    
    // Update backup codes in database
    await db.query(
      'UPDATE users SET mfa_backup_codes = ? WHERE id = ?',
      [JSON.stringify(backupCodes), req.user.id]
    );
    
    // Send response
    res.status(200).json(formatSuccess('New backup codes generated', {
      backupCodes
    }));
  } catch (error) {
    console.error('Backup codes generation error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Setup Email-based MFA
 * @route   POST /api/auth/setup-email-mfa
 * @access  Private
 */
exports.setupEmailMFA = async (req, res) => {
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Check if any type of MFA is already enabled
    if (user.mfa_enabled || user.email_mfa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is already enabled for this user. Please disable existing MFA before setting up a new one.'
      });
    }
    
    // Make sure user has an email
    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'User does not have an email address'
      });
    }
    
    // Generate a verification code
    const code = generateEmailCode();
    
    // Set code expiration (10 minutes from now)
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 10);
    
    // Store code and expiration in database
    await db.query(
      'UPDATE users SET email_mfa_code = ?, email_mfa_expires = ? WHERE id = ?',
      [code, expirationTime, req.user.id]
    );
    
    // Send email with code
    const emailSent = await sendMfaCodeByEmail(user.email, code, user.name);
    
    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }
    
    // Send response
    res.status(200).json(formatSuccess('Verification code sent to your email', {
      email: user.email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + b.replace(/./g, '*')),
      expiresIn: '10 minutes'
    }));
  } catch (error) {
    console.error('Email MFA setup error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Verify and enable Email MFA
 * @route   POST /api/auth/verify-email-mfa
 * @access  Private
 */
exports.verifyAndEnableEmailMFA = async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Verification code is required'
    });
  }
  
  try {
    // Find user with verification code
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ? AND email_mfa_code = ? AND email_mfa_expires > NOW()',
      [req.user.id, code]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }
    
    // Enable Email MFA
    await db.query(
      'UPDATE users SET email_mfa_enabled = true, email_mfa_code = NULL, email_mfa_expires = NULL WHERE id = ?',
      [req.user.id]
    );
    
    // Send response
    res.status(200).json(formatSuccess('Email MFA enabled successfully'));
  } catch (error) {
    console.error('Email MFA verification error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Send Email MFA code for login
 * @route   POST /api/auth/send-mfa-code
 * @access  Public (with temp token)
 */
exports.sendMfaCode = async (req, res) => {
  const { userId } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Check if email MFA is enabled
    if (!user.email_mfa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'Email MFA is not enabled for this user'
      });
    }
    
    // Generate a verification code
    const code = generateEmailCode();
    
    // Set code expiration (10 minutes from now)
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 10);
    
    // Store code and expiration in database
    await db.query(
      'UPDATE users SET email_mfa_code = ?, email_mfa_expires = ? WHERE id = ?',
      [code, expirationTime, userId]
    );
    
    // Send email with code
    const emailSent = await sendMfaCodeByEmail(user.email, code, user.name);
    
    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }
    
    // Send response
    res.status(200).json(formatSuccess('Verification code sent to your email', {
      email: user.email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + b.replace(/./g, '*')),
      expiresIn: '10 minutes'
    }));
  } catch (error) {
    console.error('Send MFA code error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Verify Email MFA code during login
 * @route   POST /api/auth/verify-email-mfa-login
 * @access  Public (with temp token)
 */
exports.verifyEmailMfaLogin = async (req, res) => {
  const { userId, code } = req.body;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Verification code is required'
    });
  }
  
  try {
    // Find user with verification code
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ? AND email_mfa_code = ? AND email_mfa_expires > NOW()',
      [userId, code]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }
    
    const user = rows[0];
    
    // Clear the code
    await db.query(
      'UPDATE users SET email_mfa_code = NULL, email_mfa_expires = NULL WHERE id = ?',
      [userId]
    );
    
    // Generate full JWT token with MFA verification flag
    const fullToken = jwt.sign(
      { id: user.id, role: user.role, isMfaVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
    
    // Send response
    res.status(200).json(formatSuccess('MFA verification successful', {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mfaEnabled: true,
      token: fullToken
    }));
  } catch (error) {
    console.error('Email MFA verification error:', error);
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Disable Email MFA
 * @route   POST /api/auth/disable-email-mfa
 * @access  Private
 */
exports.disableEmailMFA = async (req, res) => {
  const { password } = req.body;
  
  try {
    // Find user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = rows[0];
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
    
    // Disable Email MFA
    await db.query(
      'UPDATE users SET email_mfa_enabled = false, email_mfa_code = NULL, email_mfa_expires = NULL WHERE id = ?',
      [req.user.id]
    );
    
    // Send response
    res.status(200).json(forxmatSuccess('Email MFA disabled successfully'));
  } catch (error) {
    console.error('Email MFA disable error:', error);
    res.status(500).json(formatError(error));
  }
};
