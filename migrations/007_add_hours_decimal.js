/**
 * Migration: 007_add_hours_decimal.js
 * 
 * Purpose: Add hours_decimal field to timesheet_entries table if it doesn't already exist
 * This column is essential for accurate payroll calculations based on decimal hours
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    console.log('Checking if hours_decimal column exists in timesheet_entries table...');
    
    // Check if timesheet_entries table exists
    const [tables] = await connection.query(`
      SHOW TABLES LIKE 'timesheet_entries'
    `);
    
    if (tables.length === 0) {
      console.log('timesheet_entries table does not exist yet. Skipping migration.');
      return;
    }
    
    // Check if hours_decimal column already exists
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM timesheet_entries LIKE 'hours_decimal'
    `);
    
    if (columns.length === 0) {
      console.log('Adding hours_decimal column to timesheet_entries table...');
      
      await connection.query(`
        ALTER TABLE timesheet_entries
        ADD COLUMN hours_decimal DECIMAL(10, 2) DEFAULT 0.00
        AFTER total_hours
      `);
      
      console.log('Added hours_decimal column successfully.');
    } else {
      console.log('hours_decimal column already exists, skipping migration.');
    }
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  try {
    // Check if timesheet_entries table exists
    const [tables] = await connection.query(`
      SHOW TABLES LIKE 'timesheet_entries'
    `);
    
    if (tables.length === 0) {
      console.log('timesheet_entries table does not exist. Skipping rollback.');
      return;
    }
    
    // Check if hours_decimal column exists
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM timesheet_entries LIKE 'hours_decimal'
    `);
    
    if (columns.length > 0) {
      console.log('Removing hours_decimal column from timesheet_entries table...');
      
      await connection.query(`
        ALTER TABLE timesheet_entries
        DROP COLUMN hours_decimal
      `);
      
      console.log('Removed hours_decimal column successfully.');
    } else {
      console.log('hours_decimal column does not exist, skipping rollback.');
    }
  } catch (error) {
    console.error('Rollback error:', error);
    throw error;
  }
}

module.exports = { up, down };
