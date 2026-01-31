/**
 * Migration: 038_add_lunch_tracking.js
 * 
 * Purpose: Add lunch tracking columns to timesheet_entries table
 * This allows separating lunch time from work hours for accurate payroll calculations
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if is_lunch column exists
  const [isLunchColumn] = await connection.query(`
    SHOW COLUMNS FROM timesheet_entries LIKE 'is_lunch'
  `);
  
  if (isLunchColumn.length === 0) {
    console.log('Adding is_lunch column to timesheet_entries table...');
    await connection.query(`
      ALTER TABLE timesheet_entries
      ADD COLUMN is_lunch BOOLEAN DEFAULT FALSE AFTER hours_decimal
    `);
    console.log('is_lunch column added successfully');
  } else {
    console.log('is_lunch column already exists, skipping...');
  }
  
  // Check if lunch_hours column exists
  const [lunchHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM timesheet_entries LIKE 'lunch_hours'
  `);
  
  if (lunchHoursColumn.length === 0) {
    console.log('Adding lunch_hours column to timesheet_entries table...');
    await connection.query(`
      ALTER TABLE timesheet_entries
      ADD COLUMN lunch_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER is_lunch
    `);
    console.log('lunch_hours column added successfully');
  } else {
    console.log('lunch_hours column already exists, skipping...');
  }
  
  // Add index for is_lunch for faster lookups
  const [indexExists] = await connection.query(`
    SHOW INDEX FROM timesheet_entries WHERE Key_name = 'idx_is_lunch'
  `);
  
  if (indexExists.length === 0) {
    console.log('Adding index for is_lunch column...');
    await connection.query(`
      ALTER TABLE timesheet_entries
      ADD INDEX idx_is_lunch (is_lunch)
    `);
    console.log('Index added successfully');
  } else {
    console.log('Index idx_is_lunch already exists, skipping...');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check and drop index first
  const [indexExists] = await connection.query(`
    SHOW INDEX FROM timesheet_entries WHERE Key_name = 'idx_is_lunch'
  `);
  
  if (indexExists.length > 0) {
    console.log('Dropping index idx_is_lunch...');
    await connection.query(`
      ALTER TABLE timesheet_entries DROP INDEX idx_is_lunch
    `);
    console.log('Index dropped successfully');
  }
  
  // Check and drop is_lunch column
  const [isLunchColumn] = await connection.query(`
    SHOW COLUMNS FROM timesheet_entries LIKE 'is_lunch'
  `);
  
  if (isLunchColumn.length > 0) {
    console.log('Dropping is_lunch column from timesheet_entries table...');
    await connection.query(`
      ALTER TABLE timesheet_entries DROP COLUMN is_lunch
    `);
    console.log('is_lunch column dropped successfully');
  }
  
  // Check and drop lunch_hours column
  const [lunchHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM timesheet_entries LIKE 'lunch_hours'
  `);
  
  if (lunchHoursColumn.length > 0) {
    console.log('Dropping lunch_hours column from timesheet_entries table...');
    await connection.query(`
      ALTER TABLE timesheet_entries DROP COLUMN lunch_hours
    `);
    console.log('lunch_hours column dropped successfully');
  }
}

module.exports = { up, down };
