/**
 * Migration: 006_create_settings_tables.js
 * 
 * Purpose: Create system settings and payroll settings tables
 * These tables store configuration for the application and Antigua-specific payroll calculation rates
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if tables already exist
  const [settings] = await connection.query(`
    SHOW TABLES LIKE 'settings'
  `);
  
  const [payroll_settings] = await connection.query(`
    SHOW TABLES LIKE 'payroll_settings'
  `);
  
  // Create system settings table if it doesn't exist
  if (settings.length === 0) {
    await connection.query(`
      CREATE TABLE settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_name VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        -- Add index for improved query performance
        INDEX idx_setting_name (setting_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('System settings table created successfully');
  } else {
    console.log('System settings table already exists, skipping creation.');
  }
  
  // Create payroll settings table if it doesn't exist
  if (payroll_settings.length === 0) {
    await connection.query(`
      CREATE TABLE payroll_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        social_security_employee_rate DECIMAL(5, 2) DEFAULT 7.00,
        social_security_employer_rate DECIMAL(5, 2) DEFAULT 9.00,
        social_security_max_insurable DECIMAL(10, 2) DEFAULT 6500.00,
        medical_benefits_employee_rate DECIMAL(5, 2) DEFAULT 3.50,
        medical_benefits_employer_rate DECIMAL(5, 2) DEFAULT 3.50,
        medical_benefits_employee_senior_rate DECIMAL(5, 2) DEFAULT 2.50,
        education_levy_rate DECIMAL(5, 2) DEFAULT 2.50,
        education_levy_high_rate DECIMAL(5, 2) DEFAULT 5.00,
        education_levy_threshold DECIMAL(10, 2) DEFAULT 5000.00,
        education_levy_exemption DECIMAL(10, 2) DEFAULT 541.67,
        retirement_age INT DEFAULT 65,
        medical_benefits_senior_age INT DEFAULT 60,
        medical_benefits_max_age INT DEFAULT 70,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Payroll settings table created successfully');
  } else {
    console.log('Payroll settings table already exists, skipping creation.');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop tables
  await connection.query('DROP TABLE IF EXISTS payroll_settings');
  console.log('Payroll settings table dropped successfully');
  
  await connection.query('DROP TABLE IF EXISTS settings');
  console.log('System settings table dropped successfully');
}

module.exports = { up, down };
