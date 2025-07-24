/**
 * Migration: 022_add_vacation_columns_to_payroll_items.js
 * 
 * Purpose: Add vacation hours and vacation amount columns to payroll_items table
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the columns already exist
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'vacation_hours'
  `);
  
  if (columns.length === 0) {
    // Add new fields for tracking vacation hours and pay
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN vacation_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER overtime_amount,
      ADD COLUMN vacation_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER vacation_hours
    `);
    
    // Add YTD vacation tracking columns if they don't exist
    const [ytdColumns] = await connection.query(`
      SHOW COLUMNS FROM payroll_items LIKE 'ytd_vacation_hours'
    `);
    
    if (ytdColumns.length === 0) {
      await connection.query(`
        ALTER TABLE payroll_items 
        ADD COLUMN ytd_vacation_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_hours_worked,
        ADD COLUMN ytd_vacation_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_vacation_hours
      `);
    }
    
    // Update employee_ytd_summary table to include vacation columns
    const [ytdSummaryColumns] = await connection.query(`
      SHOW COLUMNS FROM employee_ytd_summary LIKE 'ytd_vacation_hours'
    `);
    
    if (ytdSummaryColumns.length === 0) {
      await connection.query(`
        ALTER TABLE employee_ytd_summary 
        ADD COLUMN ytd_vacation_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_hours_worked,
        ADD COLUMN ytd_vacation_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_vacation_hours
      `);
    }
    
    console.log('Added vacation tracking columns to payroll_items and YTD tables');
  } else {
    console.log('Vacation columns already exist, skipping migration');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove the vacation columns from employee_ytd_summary
  await connection.query(`
    ALTER TABLE employee_ytd_summary 
    DROP COLUMN IF EXISTS ytd_vacation_hours,
    DROP COLUMN IF EXISTS ytd_vacation_amount
  `);
  
  // Remove the YTD vacation columns from payroll_items
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN IF EXISTS ytd_vacation_hours,
    DROP COLUMN IF EXISTS ytd_vacation_amount
  `);
  
  // Remove the vacation columns from payroll_items
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN IF EXISTS vacation_hours,
    DROP COLUMN IF EXISTS vacation_amount
  `);
  
  console.log('Removed vacation tracking columns from payroll_items and YTD tables');
}

module.exports = { up, down };
