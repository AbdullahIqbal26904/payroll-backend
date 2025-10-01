/**
 * Migration: 036_update_vacation_status_enum.js
 * 
 * Purpose: Update employee_vacations status ENUM to include 'rejected' option
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Update the status ENUM to include 'rejected'
  await connection.query(`
    ALTER TABLE employee_vacations 
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending'
  `);
  
  console.log('Employee vacations status ENUM updated successfully - added "rejected" option');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // First, update any 'rejected' statuses to 'cancelled' before removing the option
  await connection.query(`
    UPDATE employee_vacations 
    SET status = 'cancelled' 
    WHERE status = 'rejected'
  `);
  
  // Revert the status ENUM to original values
  await connection.query(`
    ALTER TABLE employee_vacations 
    MODIFY COLUMN status ENUM('pending', 'approved', 'cancelled') DEFAULT 'pending'
  `);
  
  console.log('Employee vacations status ENUM reverted successfully - removed "rejected" option');
}

module.exports = { up, down };
