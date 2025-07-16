/**
 * Migration: 014_update_payment_frequency.js
 * 
 * Purpose: Update payment_frequency ENUM to include 'Semi-Monthly' option
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if payment_frequency enum already includes Semi-Monthly
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM employees LIKE 'payment_frequency'
  `);
  
  if (columns.length > 0) {
    const enumValues = columns[0].Type;
    
    // If Semi-Monthly is not already in the enum list
    if (!enumValues.includes('Semi-Monthly')) {
      await connection.query(`
        ALTER TABLE employees 
        MODIFY COLUMN payment_frequency ENUM('Monthly', 'Bi-Weekly', 'Semi-Monthly') DEFAULT 'Monthly'
      `);
      
      console.log('Updated payment_frequency to include Semi-Monthly option');
    } else {
      console.log('Semi-Monthly option already exists, skipping migration');
    }
  } else {
    console.log('payment_frequency column not found, skipping migration');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check if payment_frequency enum includes Semi-Monthly and if any employees use it
  const [employeesUsingSemiMonthly] = await connection.query(`
    SELECT COUNT(*) as count FROM employees WHERE payment_frequency = 'Semi-Monthly'
  `);
  
  if (employeesUsingSemiMonthly[0].count === 0) {
    // Only revert if no employees are using Semi-Monthly
    await connection.query(`
      ALTER TABLE employees 
      MODIFY COLUMN payment_frequency ENUM('Monthly', 'Bi-Weekly') DEFAULT 'Monthly'
    `);
    
    console.log('Removed Semi-Monthly option from payment_frequency');
  } else {
    console.log('Cannot rollback: Employees are using Semi-Monthly payment frequency');
  }
}

module.exports = { up, down };
