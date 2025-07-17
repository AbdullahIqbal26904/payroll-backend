/**
 * Migration: 016_update_payroll_items_for_overtime.js
 * 
 * Purpose: Add fields for tracking regular and overtime hours
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the columns already exist
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'regular_hours'
  `);
  
  if (columns.length === 0) {
    // Add new fields for tracking regular and overtime hours
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN regular_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER hours_worked,
      ADD COLUMN overtime_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER regular_hours,
      ADD COLUMN overtime_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER overtime_hours,
      ADD COLUMN employee_type VARCHAR(20) DEFAULT NULL AFTER employee_name
    `);
    
    console.log('Updated payroll_items table with fields for tracking regular and overtime hours');
  } else {
    console.log('Fields already exist, skipping migration');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN regular_hours,
    DROP COLUMN overtime_hours,
    DROP COLUMN overtime_amount,
    DROP COLUMN employee_type
  `);
  
  console.log('Removed regular_hours, overtime_hours, overtime_amount, and employee_type fields from payroll_items table');
}

module.exports = { up, down };
