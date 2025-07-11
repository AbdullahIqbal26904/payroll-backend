/**
 * Migration: 013_add_ytd_and_vacation_tables.js
 * 
 * Purpose: Add Year-To-Date tracking and vacation entitlement functionality
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    // Add YTD columns to payroll_items table if they don't exist
    const [ytdColumns] = await connection.query(`
      SHOW COLUMNS FROM payroll_items LIKE 'ytd_%'
    `);
    
    if (ytdColumns.length === 0) {
      await connection.query(`
        ALTER TABLE payroll_items 
        ADD COLUMN ytd_gross_pay DECIMAL(12, 2) DEFAULT 0.00 AFTER net_pay,
        ADD COLUMN ytd_social_security_employee DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_gross_pay,
        ADD COLUMN ytd_social_security_employer DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_social_security_employee,
        ADD COLUMN ytd_medical_benefits_employee DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_social_security_employer,
        ADD COLUMN ytd_medical_benefits_employer DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_medical_benefits_employee,
        ADD COLUMN ytd_education_levy DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_medical_benefits_employer,
        ADD COLUMN ytd_loan_deduction DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_education_levy,
        ADD COLUMN ytd_net_pay DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_loan_deduction,
        ADD COLUMN ytd_hours_worked DECIMAL(12, 2) DEFAULT 0.00 AFTER ytd_net_pay
      `);
      
      console.log('Added YTD columns to payroll_items table');
    }
    
    // Create employee_vacation_entitlements table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_vacation_entitlements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        annual_pto_hours DECIMAL(8, 2) DEFAULT 0.00,
        accrual_rate_per_hour DECIMAL(8, 6) DEFAULT 0.00,
        current_balance DECIMAL(8, 2) DEFAULT 0.00,
        total_earned_current_year DECIMAL(8, 2) DEFAULT 0.00,
        total_used_current_year DECIMAL(8, 2) DEFAULT 0.00,
        year INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE KEY unique_employee_year (employee_id, year),
        INDEX idx_employee_id (employee_id),
        INDEX idx_year (year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Created employee_vacation_entitlements table');
    
    // Create vacation_requests table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS vacation_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_hours DECIMAL(8, 2) NOT NULL,
        status ENUM('pending', 'approved', 'denied', 'cancelled') DEFAULT 'pending',
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_by INT NULL,
        approved_date TIMESTAMP NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_employee_id (employee_id),
        INDEX idx_dates (start_date, end_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Created vacation_requests table');
    
    // Create employee_ytd_summary table for efficient YTD calculations
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_ytd_summary (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        year INT NOT NULL,
        ytd_gross_pay DECIMAL(12, 2) DEFAULT 0.00,
        ytd_social_security_employee DECIMAL(12, 2) DEFAULT 0.00,
        ytd_social_security_employer DECIMAL(12, 2) DEFAULT 0.00,
        ytd_medical_benefits_employee DECIMAL(12, 2) DEFAULT 0.00,
        ytd_medical_benefits_employer DECIMAL(12, 2) DEFAULT 0.00,
        ytd_education_levy DECIMAL(12, 2) DEFAULT 0.00,
        ytd_loan_deduction DECIMAL(12, 2) DEFAULT 0.00,
        ytd_net_pay DECIMAL(12, 2) DEFAULT 0.00,
        ytd_hours_worked DECIMAL(12, 2) DEFAULT 0.00,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE KEY unique_employee_year (employee_id, year),
        INDEX idx_employee_id (employee_id),
        INDEX idx_year (year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Created employee_ytd_summary table');
    
  } catch (error) {
    console.error('Error in migration 013:', error);
    throw error;
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop new tables
  await connection.query('DROP TABLE IF EXISTS vacation_requests');
  console.log('Dropped vacation_requests table');
  
  await connection.query('DROP TABLE IF EXISTS employee_vacation_entitlements');
  console.log('Dropped employee_vacation_entitlements table');
  
  await connection.query('DROP TABLE IF EXISTS employee_ytd_summary');
  console.log('Dropped employee_ytd_summary table');
  
  // Remove YTD columns from payroll_items
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN IF EXISTS ytd_gross_pay,
    DROP COLUMN IF EXISTS ytd_social_security_employee,
    DROP COLUMN IF EXISTS ytd_social_security_employer,
    DROP COLUMN IF EXISTS ytd_medical_benefits_employee,
    DROP COLUMN IF EXISTS ytd_medical_benefits_employer,
    DROP COLUMN IF EXISTS ytd_education_levy,
    DROP COLUMN IF EXISTS ytd_loan_deduction,
    DROP COLUMN IF EXISTS ytd_net_pay,
    DROP COLUMN IF EXISTS ytd_hours_worked
  `);
  
  console.log('Removed YTD columns from payroll_items table');
}

module.exports = { up, down };
