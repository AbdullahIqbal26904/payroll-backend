/**
 * Migration: 041_add_supervisor_employee_type.js
 * 
 * Purpose: Add 'supervisor' type to the employee_type ENUM in employees table.
 * Supervisors are salaried and do NOT receive overtime, vacation pay, or holiday pay.
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Modify the employee_type column to include the supervisor option
  await connection.query(`
    ALTER TABLE employees 
    MODIFY COLUMN employee_type ENUM('salary', 'hourly', 'private_duty_nurse', 'supervisor') NOT NULL DEFAULT 'hourly'
  `);
  
  console.log('Updated employee_type ENUM to include supervisor');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check if any employees are using the supervisor type
  const [supervisors] = await connection.query(`
    SELECT id FROM employees WHERE employee_type = 'supervisor'
  `);
  
  if (supervisors.length > 0) {
    console.log('Warning: Some employees are set as supervisor. Converting to salary before removing the type.');
    // Convert all supervisor employees to salary (since supervisors are salaried)
    await connection.query(`
      UPDATE employees SET employee_type = 'salary' WHERE employee_type = 'supervisor'
    `);
  }
  
  // Remove the supervisor option from ENUM
  await connection.query(`
    ALTER TABLE employees 
    MODIFY COLUMN employee_type ENUM('salary', 'hourly', 'private_duty_nurse') NOT NULL DEFAULT 'hourly'
  `);
  
  console.log('Removed supervisor from employee_type ENUM');
}

module.exports = { up, down };
