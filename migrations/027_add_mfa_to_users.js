/**
 * Migration to add multi-factor authentication fields to the users table
 */
exports.up = async (db) => {
  try {
    // Add MFA fields to users table
    await db.query(`
      ALTER TABLE users
      ADD COLUMN mfa_enabled BOOLEAN DEFAULT false,
      ADD COLUMN mfa_secret VARCHAR(255),
      ADD COLUMN mfa_backup_codes TEXT
    `);
    
    console.log('Successfully added MFA fields to users table');
    return true;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
};

exports.down = async (db) => {
  try {
    // Remove MFA columns
    await db.query(`
      ALTER TABLE users
      DROP COLUMN mfa_enabled,
      DROP COLUMN mfa_secret,
      DROP COLUMN mfa_backup_codes
    `);
    
    console.log('Successfully removed MFA fields from users table');
    return true;
  } catch (error) {
    console.error('Migration error:', error);
    return false;
  }
};
