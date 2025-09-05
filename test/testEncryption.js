/**
 * Test script for encryption utilities
 * Run this script to verify that the encryption/decryption functionality works correctly
 */

const { encrypt, decrypt, maskString, isValidAccountNumber, isValidRoutingNumber } = require('../utils/encryptionUtils');

// Test data
const testData = {
  accountNumber: '1234567890123456',
  routingNumber: '123456789',
  sensitiveText: 'This is sensitive information'
};

// Set environment variable for testing (should be set in .env in production)
process.env.ENCRYPTION_KEY = 'TESTKEY32CHARS0123456789abcdefghi';

console.log('---- ENCRYPTION UTILITY TEST ----');
console.log('\nEncryption Key (first 5 chars):', process.env.ENCRYPTION_KEY.substring(0, 5) + '...');

// Test encryption/decryption
try {
  console.log('\n1. Testing Encryption/Decryption:');
  
  console.log('\nOriginal account number:', testData.accountNumber);
  const encryptedAccountNumber = encrypt(testData.accountNumber);
  console.log('Encrypted account number:', encryptedAccountNumber);
  const decryptedAccountNumber = decrypt(encryptedAccountNumber);
  console.log('Decrypted account number:', decryptedAccountNumber);
  console.log('Decryption successful:', testData.accountNumber === decryptedAccountNumber);
  
  console.log('\nOriginal routing number:', testData.routingNumber);
  const encryptedRoutingNumber = encrypt(testData.routingNumber);
  console.log('Encrypted routing number:', encryptedRoutingNumber);
  const decryptedRoutingNumber = decrypt(encryptedRoutingNumber);
  console.log('Decrypted routing number:', decryptedRoutingNumber);
  console.log('Decryption successful:', testData.routingNumber === decryptedRoutingNumber);
  
  console.log('\nOriginal sensitive text:', testData.sensitiveText);
  const encryptedText = encrypt(testData.sensitiveText);
  console.log('Encrypted text:', encryptedText);
  const decryptedText = decrypt(encryptedText);
  console.log('Decrypted text:', decryptedText);
  console.log('Decryption successful:', testData.sensitiveText === decryptedText);
} catch (error) {
  console.error('\nError in encryption/decryption test:', error.message);
}

// Test masking
try {
  console.log('\n2. Testing Masking:');
  
  console.log('\nAccount number:', testData.accountNumber);
  console.log('Masked (default):', maskString(testData.accountNumber));
  console.log('Masked (2 visible):', maskString(testData.accountNumber, 2));
  console.log('Masked (6 visible, X):', maskString(testData.accountNumber, 6, 'X'));
} catch (error) {
  console.error('\nError in masking test:', error.message);
}

// Test validation
try {
  console.log('\n3. Testing Validation:');
  
  console.log('\nValid account number (1234567890123456):', isValidAccountNumber('1234567890123456'));
  console.log('Invalid account number (abc123):', isValidAccountNumber('abc123'));
  console.log('Invalid account number (123):', isValidAccountNumber('123'));
  
  console.log('\nValid routing number (123456789):', isValidRoutingNumber('123456789'));
  console.log('Invalid routing number (12345678):', isValidRoutingNumber('12345678'));
  console.log('Invalid routing number (12345678a):', isValidRoutingNumber('12345678a'));
} catch (error) {
  console.error('\nError in validation test:', error.message);
}

console.log('\n---- TEST COMPLETED ----');
