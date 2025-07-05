/**
 * Migration: 002_create_employees.js
 * 
 * Purpose: Create the employees table which stores detailed employee information for payroll processing.
 * This table has a relationship with users table for login capabilities.
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employees'
  `);
  
  if (tables.length > 0) {
    console.log('Employees table already exists, skipping creation.');
    return;
  }

  // Create employees table with proper constraints and indexes
  await connection.query(`
    CREATE TABLE employees (
      id VARCHAR(20) PRIMARY KEY,
      user_id INT,
      first_name VARCHAR(50) NOT NULL,
      last_name VARCHAR(50) NOT NULL,
      date_of_birth DATE,
      gender ENUM('Male', 'Female', 'Other'),
      address TEXT,
      phone VARCHAR(20),
      hire_date DATE,
      job_title VARCHAR(100),
      department VARCHAR(100),
      salary_amount DECIMAL(10, 2) DEFAULT 0.00,
      payment_frequency ENUM('Monthly', 'Bi-Weekly') DEFAULT 'Monthly',
      date_of_birth_for_age INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- Foreign key constraint
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      
      -- Add indexes for improved query performance
      INDEX idx_name (last_name, first_name),
      INDEX idx_department (department),
      INDEX idx_hire_date (hire_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Employees table created successfully');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check foreign key constraints before dropping
  const [foreignKeys] = await connection.query(`
    SELECT TABLE_NAME, CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND REFERENCED_TABLE_NAME = 'employees'
  `);

  // Drop foreign key constraints first
  for (const fk of foreignKeys) {
    await connection.query(`
      ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}
    `);
    console.log(`Dropped foreign key ${fk.CONSTRAINT_NAME} from ${fk.TABLE_NAME}`);
  }
  
  // Drop the table
  await connection.query('DROP TABLE IF EXISTS employees');
  console.log('Employees table dropped successfully');
}

module.exports = { up, down };
