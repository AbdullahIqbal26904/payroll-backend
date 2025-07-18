/**
 * Migration: 017_add_private_duty_nurse_type.js
 * 
 * Purpose: Add private_duty_nurse type to the employee_type ENUM in employees table
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Modify the employee_type column to include the private_duty_nurse option
  await connection.query(`
    ALTER TABLE employees 
    MODIFY COLUMN employee_type ENUM('salary', 'hourly', 'private_duty_nurse') NOT NULL DEFAULT 'hourly'
  `);
  
  console.log('Updated employee_type ENUM to include private_duty_nurse');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check if any employees are using the private_duty_nurse type
  const [nurses] = await connection.query(`
    SELECT id FROM employees WHERE employee_type = 'private_duty_nurse'
  `);
  
  if (nurses.length > 0) {
    console.log('Warning: Some employees are set as private_duty_nurse. Converting to hourly before removing the type.');
    // Convert all private_duty_nurse employees to hourly
    await connection.query(`
      UPDATE employees SET employee_type = 'hourly' WHERE employee_type = 'private_duty_nurse'
    `);
  }
  
  // Remove the private_duty_nurse option from ENUM
  await connection.query(`
    ALTER TABLE employees 
    MODIFY COLUMN employee_type ENUM('salary', 'hourly') NOT NULL DEFAULT 'hourly'
  `);
  
  console.log('Removed private_duty_nurse from employee_type ENUM');
}

module.exports = { up, down };
