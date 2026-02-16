/**
 * Migration: 034_add_employee_leave_system.js
 * 
 * Purpose: Create leave tracking system for sick/maternity leave
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employee_leaves'
  `);
  
  if (tables.length > 0) {
    console.log('Employee leaves table already exists, skipping creation.');
    return;
  }

  // Create employee_leaves table
  await connection.query(`
    CREATE TABLE employee_leaves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(20) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      total_hours DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      hourly_rate DECIMAL(10, 2),
      status ENUM('pending', 'approved', 'cancelled') DEFAULT 'pending',
      leave_type ENUM('maternity', 'compassionate', 'uncertified_sick', 'certified_sick') NOT NULL,
      payment_percentage DECIMAL(5, 2) DEFAULT 100.00,
      created_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- Foreign key constraints
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
      
      -- Add indexes for improved query performance
      INDEX idx_employee (employee_id),
      INDEX idx_dates (start_date, end_date),
      INDEX idx_status (status),
      INDEX idx_leave_type (leave_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Employee leaves table created successfully');
  
  // Add leave columns to payroll_items table
  const [leaveColumns] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'leave_hours'
  `);
  
  if (leaveColumns.length === 0) {
    // Add new fields for tracking leave hours and pay
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN leave_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER vacation_amount,
      ADD COLUMN leave_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER leave_hours,
      ADD COLUMN leave_type VARCHAR(20) DEFAULT NULL AFTER leave_amount
    `);
    
    // Add YTD leave tracking columns
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN ytd_leave_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_vacation_amount,
      ADD COLUMN ytd_leave_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_leave_hours
    `);
    
    // Update employee_ytd_summary table to include leave columns
    await connection.query(`
      ALTER TABLE employee_ytd_summary 
      ADD COLUMN ytd_leave_hours DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_vacation_amount,
      ADD COLUMN ytd_leave_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER ytd_leave_hours
    `);
    
    console.log('Leave columns added to payroll_items and YTD tables');
  }
}

/**
 * Revert the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop leave columns from payroll_items
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN leave_hours,
    DROP COLUMN leave_amount,
    DROP COLUMN leave_type,
    DROP COLUMN ytd_leave_hours,
    DROP COLUMN ytd_leave_amount
  `);
  
  // Drop leave columns from ytd_summary
  await connection.query(`
    ALTER TABLE employee_ytd_summary 
    DROP COLUMN ytd_leave_hours,
    DROP COLUMN ytd_leave_amount
  `);
  
  // Drop the employee_leaves table
  await connection.query(`
    DROP TABLE IF EXISTS employee_leaves
  `);
  
  console.log('Employee leave system removed successfully');
}

module.exports = { up, down };