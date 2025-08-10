/**
 * Migration: 026_add_departments_table.js
 * 
 * Purpose: Create a departments table and update employees table to reference departments
 * This enables better organization of employees and reporting by department
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Create departments table if it doesn't exist
  const [deptTable] = await connection.query(`
    SHOW TABLES LIKE 'departments'
  `);
  
  if (deptTable.length === 0) {
    await connection.query(`
      CREATE TABLE departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        -- Add unique constraint on name to prevent duplicates
        UNIQUE KEY unique_dept_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Departments table created successfully');
    
    // Insert some default departments
    await connection.query(`
      INSERT INTO departments (name, code, description)
      VALUES 
        ('Administration', 'ADMIN', 'Administrative staff including managers and executives'),
        ('Finance', 'FIN', 'Finance department including accounting and payroll'),
        ('Human Resources', 'HR', 'Human resources department'),
        ('Operations', 'OPS', 'Operations department'),
        ('Sales', 'SALES', 'Sales and marketing department')
    `);
    
    console.log('Default departments added successfully');
  } else {
    console.log('Departments table already exists, skipping creation');
  }

  // Check if department_id column exists in employees table
  const [employeeColumns] = await connection.query(`
    SHOW COLUMNS FROM employees LIKE 'department_id'
  `);
  
  if (employeeColumns.length === 0) {
    // Add department_id column to employees table
    await connection.query(`
      ALTER TABLE employees 
      ADD COLUMN department_id INT,
      ADD COLUMN status ENUM('active', 'inactive') DEFAULT 'active' AFTER department_id,
      ADD FOREIGN KEY fk_department (department_id) REFERENCES departments(id) ON DELETE SET NULL
    `);
    
    console.log('Added department_id and status columns to employees table');

    // Migrate existing department data to use the department_id relationship
    await connection.query(`
      UPDATE employees e
      JOIN departments d ON e.department = d.name
      SET e.department_id = d.id
    `);
    
    console.log('Migrated existing department data');
  } else {
    console.log('department_id column already exists in employees table, skipping addition');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove foreign key constraint
  try {
    await connection.query(`
      ALTER TABLE employees 
      DROP FOREIGN KEY fk_department
    `);
    console.log('Dropped foreign key constraint fk_department from employees table');
  } catch (error) {
    console.error('Error dropping foreign key constraint:', error.message);
  }

  // Drop department_id column from employees table
  try {
    await connection.query(`
      ALTER TABLE employees
      DROP COLUMN department_id,
      DROP COLUMN status
    `);
    console.log('Dropped department_id and status columns from employees table');
  } catch (error) {
    console.error('Error dropping columns:', error.message);
  }

  // Drop departments table
  try {
    await connection.query(`
      DROP TABLE IF EXISTS departments
    `);
    console.log('Departments table dropped successfully');
  } catch (error) {
    console.error('Error dropping departments table:', error.message);
  }
}

module.exports = { up, down };
