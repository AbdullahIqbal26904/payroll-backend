/**
 * Migration: 010_update_employees_table.js
 * 
 * Purpose: Update employees table to include hourly rate and exemption fields
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the columns already exist
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM employees LIKE 'hourly_rate'
  `);
  
  if (columns.length === 0) {
    // Add hourly_rate field
    await connection.query(`
      ALTER TABLE employees 
      ADD COLUMN hourly_rate DECIMAL(10, 2) DEFAULT 0.00 AFTER salary_amount,
      ADD COLUMN is_exempt_ss BOOLEAN DEFAULT FALSE AFTER payment_frequency,
      ADD COLUMN is_exempt_medical BOOLEAN DEFAULT FALSE AFTER is_exempt_ss,
      ADD COLUMN email VARCHAR(100) AFTER phone
    `);
    
    console.log('Updated employees table with hourly_rate and exemption fields');
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
    ALTER TABLE employees 
    DROP COLUMN hourly_rate,
    DROP COLUMN is_exempt_ss,
    DROP COLUMN is_exempt_medical,
    DROP COLUMN email
  `);
  
  console.log('Removed hourly_rate and exemption fields from employees table');
}

module.exports = { up, down };
