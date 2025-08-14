const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

/**
 * Generate a new TOTP secret for a user
 * @returns {Object} Object containing secret in different formats
 */
exports.generateSecret = (userEmail) => {
  return speakeasy.generateSecret({
    length: 20,
    name: `Payroll System:${userEmail}`
  });
};

/**
 * Generate a random numeric code for email-based MFA
 * @param {number} length - Length of the code to generate
 * @returns {string} The generated code
 */
exports.generateEmailCode = (length = 6) => {
  // Generate a random numeric code
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

/**
 * Verify a TOTP token against a secret
 * @param {string} token - The token to verify
 * @param {string} secret - The secret to verify against (base32 format)
 * @returns {boolean} True if token is valid
 */
exports.verifyToken = (token, secret) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 1 // Allow 1 step before/after current time
  });
};

/**
 * Generate a QR code URL for the given secret
 * @param {Object} secret - The secret object returned by generateSecret
 * @returns {Promise<string>} The QR code as a data URL
 */
exports.generateQRCode = async (secret) => {
  try {
    return await qrcode.toDataURL(secret.otpauth_url);
  } catch (error) {
    throw new Error('Error generating QR code');
  }
};

/**
 * Generate backup codes for user
 * @param {number} count - Number of backup codes to generate
 * @returns {Array<string>} Array of backup codes
 */
exports.generateBackupCodes = (count = 10) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
};

/**
 * Verify a backup code
 * @param {string} code - The backup code to verify
 * @param {Array<string>} storedCodes - Array of stored backup codes
 * @returns {Object} Object with isValid boolean and remaining codes array
 */
exports.verifyBackupCode = (code, storedCodes) => {
  const codes = Array.isArray(storedCodes) ? storedCodes : JSON.parse(storedCodes || '[]');
  
  // Check if the code exists in the stored codes
  const index = codes.indexOf(code);
  
  if (index === -1) {
    return { isValid: false, remainingCodes: codes };
  }
  
  // Remove the used code
  const remainingCodes = [...codes];
  remainingCodes.splice(index, 1);
  
  return { isValid: true, remainingCodes };
};

/**
 * Send MFA code via email
 * @param {string} email - Recipient's email address
 * @param {string} code - The MFA code to send
 * @param {string} name - Recipient's name
 * @returns {Promise<boolean>} True if email was sent successfully
 */
exports.sendMfaCodeByEmail = async (email, code, name = 'User') => {
  try {
    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Create email content
    const mailOptions = {
      from: `"Payroll System Security" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Your Security Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center;">
            <h1 style="color: #333;">Security Verification</h1>
          </div>
          <div style="padding: 20px; border: 1px solid #ddd; background-color: #fff;">
            <p>Dear ${name},</p>
            <p>Your security verification code is:</p>
            <div style="background-color: #f9f9f9; padding: 15px; font-size: 24px; text-align: center; letter-spacing: 5px; font-weight: bold; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you did not request this code, please ignore this email or contact support immediately.</p>
            <p>Thank you,<br>Payroll System Security Team</p>
          </div>
          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #666;">
            <p>This is an automated message, please do not reply.</p>
          </div>
        </div>
      `
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('MFA email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending MFA email:', error);
    return false;
  }
};
