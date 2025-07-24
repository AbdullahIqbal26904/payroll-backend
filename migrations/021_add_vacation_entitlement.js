/**
 * Migration: 021_add_vacation_entitlement.js
 * 
 * Purpose: Create vacation entitlement table for tracking employee vacation time
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employee_vacations'
  `);
  
  if (tables.length > 0) {
    console.log('Employee vacations table already exists, skipping creation.');
    return;
  }

  // Create employee_vacations table
  await connection.query(`
    CREATE TABLE employee_vacations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      total_hours DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      hourly_rate DECIMAL(10, 2),
      status ENUM('pending', 'approved', 'cancelled') DEFAULT 'pending',
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- Foreign key constraints
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
      
      -- Add indexes for improved query performance
      INDEX idx_employee (employee_id),
      INDEX idx_dates (start_date, end_date),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Employee vacations table created successfully');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS employee_vacations');
  console.log('Employee vacations table dropped successfully');
}

module.exports = { up, down };
