/**
 * Migration: 015_add_employee_type.js
 * 
 * Purpose: Add employee_type field to employees table for salary vs hourly classification
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the column already exists
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM employees LIKE 'employee_type'
  `);
  
  if (columns.length === 0) {
    // Add employee_type field
    await connection.query(`
      ALTER TABLE employees 
      ADD COLUMN employee_type ENUM('salary', 'hourly') NOT NULL DEFAULT 'hourly' AFTER job_title,
      ADD COLUMN standard_hours DECIMAL(10, 2) DEFAULT 40.00 AFTER hourly_rate
    `);
    
    console.log('Updated employees table with employee_type and standard_hours fields');
  } else {
    console.log('employee_type field already exists, skipping migration');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  await connection.query(`
    ALTER TABLE employees 
    DROP COLUMN employee_type,
    DROP COLUMN standard_hours
  `);
  
  console.log('Removed employee_type and standard_hours fields from employees table');
}

module.exports = { up, down };
