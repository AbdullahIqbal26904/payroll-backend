/**
 * Migration: 031_update_employee_status_enum.js
 * 
 * Purpose: Update the status ENUM in employees table to include 'archived' status
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    // Alter the status column to include 'archived' in the ENUM
    await connection.query(`
      ALTER TABLE employees 
      MODIFY COLUMN status ENUM('active', 'inactive', 'archived') DEFAULT 'active'
    `);
    
    console.log('Updated employees table status ENUM to include archived status');
  } catch (error) {
    console.error('Error updating employees table status ENUM:', error);
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
    // Check if there are any employees with archived status
    const [archivedEmployees] = await connection.query(`
      SELECT COUNT(*) as count FROM employees WHERE status = 'archived'
    `);
    
    if (archivedEmployees[0].count > 0) {
      // If there are archived employees, update them to 'inactive' before modifying the ENUM
      await connection.query(`
        UPDATE employees SET status = 'inactive' WHERE status = 'archived'
      `);
      
      console.log(`Updated ${archivedEmployees[0].count} archived employees to inactive status`);
    }
    
    // Revert the status column back to original ENUM
    await connection.query(`
      ALTER TABLE employees 
      MODIFY COLUMN status ENUM('active', 'inactive') DEFAULT 'active'
    `);
    
    console.log('Reverted employees table status ENUM to original values');
  } catch (error) {
    console.error('Error reverting employees table status ENUM:', error);
    throw error;
  }
}

module.exports = { up, down };