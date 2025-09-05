/**
 * Migration: 031_add_employee_banking_info.js
 * 
 * Purpose: Create the employee_banking_info table for securely storing ACH payment information
 * with proper encryption and security mechanisms.
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employee_banking_info'
  `);
  
  if (tables.length > 0) {
    console.log('Employee banking info table already exists, skipping creation.');
    return;
  }

  // Create employee_banking_info table with proper constraints and indexes
  await connection.query(`
    CREATE TABLE employee_banking_info (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(20) NOT NULL,
      bank_name VARCHAR(100) NOT NULL,
      account_type ENUM('Checking', 'Savings') NOT NULL DEFAULT 'Checking',
      account_number_encrypted TEXT NOT NULL,
      routing_number_encrypted TEXT NOT NULL,
      is_primary BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      direct_deposit_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      created_by INT,
      updated_by INT,
      
      -- Foreign key constraint
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
      
      -- Add indexes for improved query performance
      INDEX idx_employee_id (employee_id),
      INDEX idx_is_primary (is_primary),
      INDEX idx_is_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Employee banking info table created successfully');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop the table
  await connection.query('DROP TABLE IF EXISTS employee_banking_info');
  console.log('Employee banking info table dropped successfully');
}

module.exports = { up, down };
