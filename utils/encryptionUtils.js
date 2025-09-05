/**
 * Encryption utilities for handling sensitive data
 * 
 * This module provides functions to encrypt and decrypt sensitive data
 * using AES-256-CBC encryption with appropriate initialization vectors
 * and secure key management.
 */

const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

// Constants for encryption
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes (256 bits)
const ENCRYPTION_IV_LENGTH = 16; // For AES, this is always 16 bytes (128 bits)
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts sensitive data
 * 
 * @param {string} text - Plain text data to encrypt
 * @returns {string} - Encrypted data in format: iv:encryptedData (Base64 encoded)
 * @throws {Error} If encryption key is missing or invalid
 */
exports.encrypt = (text) => {
  if (!text) return null;
  
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('Encryption key is missing or invalid. Must be 32 characters long.');
  }
  
  try {
    // Generate a new IV for each encryption operation
    const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
    
    // Create cipher using key and IV
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM, 
      Buffer.from(ENCRYPTION_KEY), 
      iv
    );
    
    // Encrypt the data
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Return IV + encrypted data as base64 string
    return `${iv.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypts encrypted data
 * 
 * @param {string} encryptedText - Encrypted data in format: iv:encryptedData (Base64 encoded)
 * @returns {string} - Decrypted plain text
 * @throws {Error} If decryption fails
 */
exports.decrypt = (encryptedText) => {
  if (!encryptedText) return null;
  
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
    throw new Error('Encryption key is missing or invalid. Must be 32 characters long.');
  }
  
  try {
    // Split the IV from the encrypted data
    const textParts = encryptedText.split(':');
    if (textParts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(textParts[0], 'base64');
    const encryptedData = Buffer.from(textParts[1], 'base64');
    
    // Create decipher using key and IV
    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM, 
      Buffer.from(ENCRYPTION_KEY), 
      iv
    );
    
    // Decrypt the data
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Masks a sensitive string (like account number) by showing only the last few characters
 * 
 * @param {string} text - Text to mask
 * @param {number} visibleChars - Number of characters to show (from end)
 * @param {string} maskChar - Character to use for masking
 * @returns {string} - Masked string
 */
exports.maskString = (text, visibleChars = 4, maskChar = '*') => {
  if (!text) return '';
  
  const textStr = String(text);
  if (textStr.length <= visibleChars) {
    return textStr;
  }
  
  const maskedPortion = maskChar.repeat(textStr.length - visibleChars);
  const visiblePortion = textStr.slice(-visibleChars);
  
  return `${maskedPortion}${visiblePortion}`;
};

/**
 * Validates bank account number format
 * 
 * @param {string} accountNumber - Account number to validate
 * @returns {boolean} - True if valid format
 */
exports.isValidAccountNumber = (accountNumber) => {
  // Basic validation: only digits, length between 4-17 characters
  return /^\d{4,17}$/.test(accountNumber);
};

/**
 * Validates routing number format
 * 
 * @param {string} routingNumber - Routing number to validate
 * @returns {boolean} - True if valid format
 */
exports.isValidRoutingNumber = (routingNumber) => {
  // Basic ABA routing number validation: 9 digits
  return /^\d{9}$/.test(routingNumber);
};
