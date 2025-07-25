/**
 * Migration: 023_add_public_holidays.js
 * 
 * Purpose: Create public holiday system for paid holidays
 * This migration adds a table to track public holidays and their payment rules
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Create public holidays table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS public_holidays (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      date DATE NOT NULL,
      year INT NOT NULL,
      description TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- Add indexes for improved query performance
      INDEX idx_date (date),
      INDEX idx_year (year),
      FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Public holidays table created successfully');

  // Add flag in settings to enable/disable auto paid holidays
  await connection.query(`
    INSERT INTO settings (setting_name, setting_value, description)
    VALUES ('paid_public_holidays_enabled', 'true', 'Enable automatic payment for public holidays')
    ON DUPLICATE KEY UPDATE setting_value = 'true'
  `);
  
  console.log('Added paid public holidays setting');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop table
  await connection.query('DROP TABLE IF EXISTS public_holidays');
  console.log('Public holidays table dropped successfully');
  
  // Remove setting
  await connection.query(`
    DELETE FROM settings WHERE setting_name = 'paid_public_holidays_enabled'
  `);
  console.log('Removed paid public holidays setting');
}

module.exports = { up, down };
