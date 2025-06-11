/**
 * Migration: 001_create_users.js
 * 
 * Purpose: Create the users table which is fundamental for authentication and authorization
 * in the Payroll System. This table stores all user information including credentials and roles.
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'users'
  `);
  
  if (tables.length > 0) {
    console.log('Users table already exists, skipping creation.');
    return;
  }
  
  // Create users table with roles (admin, employee)
  await connection.query(`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- Add index for improved query performance on lookups
      INDEX idx_email (email),
      INDEX idx_role (role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Users table created successfully');
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
    AND REFERENCED_TABLE_NAME = 'users'
  `);

  // Drop foreign key constraints first
  for (const fk of foreignKeys) {
    await connection.query(`
      ALTER TABLE ${fk.TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}
    `);
    console.log(`Dropped foreign key ${fk.CONSTRAINT_NAME} from ${fk.TABLE_NAME}`);
  }
  
  // Drop the table
  await connection.query('DROP TABLE IF EXISTS users');
  console.log('Users table dropped successfully');
}

module.exports = { up, down };
