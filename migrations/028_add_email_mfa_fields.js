/**
 * Migration to add email-based MFA fields to the users table
 */
exports.up = async (db) => {
  try {
    // Add email MFA fields to users table
    await db.query(`
      ALTER TABLE users
      ADD COLUMN email_mfa_enabled BOOLEAN DEFAULT false,
      ADD COLUMN email_mfa_code VARCHAR(10),
      ADD COLUMN email_mfa_expires DATETIME
    `);
    
    console.log('Successfully added email MFA fields to users table');
    return true;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
};

exports.down = async (db) => {
  try {
    // Remove email MFA columns
    await db.query(`
      ALTER TABLE users
      DROP COLUMN email_mfa_enabled,
      DROP COLUMN email_mfa_code,
      DROP COLUMN email_mfa_expires
    `);
    
    console.log('Successfully removed email MFA fields from users table');
    return true;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
};
