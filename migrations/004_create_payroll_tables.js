/**
 * Migration: 004_create_payroll_tables.js
 * 
 * Purpose: Create tables for payroll runs and payroll items to store calculation results
 * These tables are essential for storing payroll calculation results based on Antigua's tax rules
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if tables already exist
  const [payroll_runs] = await connection.query(`
    SHOW TABLES LIKE 'payroll_runs'
  `);
  
  const [payroll_items] = await connection.query(`
    SHOW TABLES LIKE 'payroll_items'
  `);
  
  
  // Create payroll runs table if it doesn't exist
  if (payroll_runs.length === 0) {
    await connection.query(`
      CREATE TABLE payroll_runs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        period_id INT,
        pay_date DATE,
        status ENUM('processing', 'completed', 'completed_with_errors', 'finalized') DEFAULT 'processing',
        total_employees INT DEFAULT 0,
        total_gross DECIMAL(12, 2) DEFAULT 0.00,
        total_net DECIMAL(12, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT,
        
        -- Foreign key constraints
        FOREIGN KEY (period_id) REFERENCES timesheet_periods(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        
        -- Add indexes for improved query performance
        INDEX idx_period_id (period_id),
        INDEX idx_pay_date (pay_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Payroll runs table created successfully');
  } else {
    console.log('Payroll runs table already exists, skipping creation.');
  }
  
  // Create payroll items table if it doesn't exist
  if (payroll_items.length === 0) {
    await connection.query(`
      CREATE TABLE payroll_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payroll_run_id INT,
        employee_id VARCHAR(20) NULL,
        employee_name VARCHAR(200) NOT NULL,
        hours_worked DECIMAL(10, 2) DEFAULT 0.00,
        gross_pay DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employee DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employer DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employee DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employer DECIMAL(10, 2) DEFAULT 0.00,
        education_levy DECIMAL(10, 2) DEFAULT 0.00,
        net_pay DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraints
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
        
        -- Add indexes for improved query performance
        INDEX idx_payroll_run_id (payroll_run_id),
        INDEX idx_employee_id (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Payroll items table created successfully');
  } else {
    console.log('Payroll items table already exists, skipping creation.');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop tables in reverse order to maintain referential integrity
  await connection.query('DROP TABLE IF EXISTS payroll_items');
  console.log('Payroll items table dropped successfully');
  
  await connection.query('DROP TABLE IF EXISTS payroll_runs');
  console.log('Payroll runs table dropped successfully');
}

module.exports = { up, down };
