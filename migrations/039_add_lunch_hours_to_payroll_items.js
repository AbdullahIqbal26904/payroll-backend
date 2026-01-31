/**
 * Migration: 039_add_lunch_hours_to_payroll_items.js
 * 
 * Purpose: Add lunch_hours column to payroll_items table to track and report lunch time deductions
 * This allows the payroll system to show how much lunch time was excluded from paid hours
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if lunch_hours column exists in payroll_items
  const [lunchHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'lunch_hours'
  `);
  
  if (lunchHoursColumn.length === 0) {
    console.log('Adding lunch_hours column to payroll_items table...');
    await connection.query(`
      ALTER TABLE payroll_items
      ADD COLUMN lunch_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER hours_worked
    `);
    console.log('lunch_hours column added successfully');
  } else {
    console.log('lunch_hours column already exists, skipping...');
  }
  
  // Check if total_hours column exists (includes lunch before deduction)
  const [totalHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'total_hours'
  `);
  
  if (totalHoursColumn.length === 0) {
    console.log('Adding total_hours column to payroll_items table...');
    await connection.query(`
      ALTER TABLE payroll_items
      ADD COLUMN total_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER lunch_hours
    `);
    console.log('total_hours column added successfully');
  } else {
    console.log('total_hours column already exists, skipping...');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check and drop lunch_hours column
  const [lunchHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'lunch_hours'
  `);
  
  if (lunchHoursColumn.length > 0) {
    console.log('Dropping lunch_hours column from payroll_items table...');
    await connection.query(`
      ALTER TABLE payroll_items DROP COLUMN lunch_hours
    `);
    console.log('lunch_hours column dropped successfully');
  }
  
  // Check and drop total_hours column
  const [totalHoursColumn] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'total_hours'
  `);
  
  if (totalHoursColumn.length > 0) {
    console.log('Dropping total_hours column from payroll_items table...');
    await connection.query(`
      ALTER TABLE payroll_items DROP COLUMN total_hours
    `);
    console.log('total_hours column dropped successfully');
  }
}

module.exports = { up, down };
