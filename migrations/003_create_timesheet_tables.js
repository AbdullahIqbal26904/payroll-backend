/**
 * Migration: 003_create_timesheet_tables.js
 * 
 * Purpose: Create tables for timesheet periods and entries to track employee working hours
 * This is essential for payroll calculations based on hours worked
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if tables already exist
  const [timesheet_periods] = await connection.query(`
    SHOW TABLES LIKE 'timesheet_periods'
  `);
  
  const [timesheet_entries] = await connection.query(`
    SHOW TABLES LIKE 'timesheet_entries'
  `);
  
  // Create timesheet periods table if it doesn't exist
  if (timesheet_periods.length === 0) {
    await connection.query(`
      CREATE TABLE timesheet_periods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_title VARCHAR(255) DEFAULT 'Timesheet Report',
        period_start DATE,
        period_end DATE,
        status ENUM('pending', 'processed', 'finalized') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT,
        
        -- Foreign key constraint
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        
        -- Add indexes for improved query performance
        INDEX idx_period_dates (period_start, period_end),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Timesheet periods table created successfully');
  } else {
    console.log('Timesheet periods table already exists, skipping creation.');
  }
  
  // Create timesheet entries table if it doesn't exist
  if (timesheet_entries.length === 0) {
    await connection.query(`
      CREATE TABLE timesheet_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        period_id INT,
        employee_id VARCHAR(50) NULL,
        last_name VARCHAR(100) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        work_date DATE,
        time_in VARCHAR(20),
        time_out VARCHAR(20),
        total_hours VARCHAR(20),
        hours_decimal DECIMAL(10, 2) DEFAULT 0.00,
        dept_code VARCHAR(20),
        in_location VARCHAR(100),
        in_punch_method VARCHAR(50),
        out_location VARCHAR(100),
        out_punch_method VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign key constraint
        FOREIGN KEY (period_id) REFERENCES timesheet_periods(id) ON DELETE CASCADE,
        
        -- Add indexes for improved query performance
        INDEX idx_period_id (period_id),
        INDEX idx_employee (last_name, first_name),
        INDEX idx_work_date (work_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Timesheet entries table created successfully');
  } else {
    console.log('Timesheet entries table already exists, skipping creation.');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop tables in reverse order to maintain referential integrity
  await connection.query('DROP TABLE IF EXISTS timesheet_entries');
  console.log('Timesheet entries table dropped successfully');
  
  await connection.query('DROP TABLE IF EXISTS timesheet_periods');
  console.log('Timesheet periods table dropped successfully');
}

module.exports = { up, down };
