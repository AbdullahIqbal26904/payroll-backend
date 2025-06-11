/**
 * Migration: 005_create_audit_trail.js
 * 
 * Purpose: Create audit trail table to track changes in the system
 * This is important for compliance and tracking who made what changes
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if table already exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'audit_trail'
  `);
  
  if (tables.length > 0) {
    console.log('Audit trail table already exists, skipping creation.');
    return;
  }
  
  // Create audit trail table
  await connection.query(`
    CREATE TABLE audit_trail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT,
      action VARCHAR(255) NOT NULL,
      entity VARCHAR(50) NOT NULL,
      entity_id INT,
      old_values JSON,
      new_values JSON,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Foreign key constraint
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      
      -- Add indexes for improved query performance
      INDEX idx_user_id (user_id),
      INDEX idx_entity (entity),
      INDEX idx_entity_id (entity_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  
  console.log('Audit trail table created successfully');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS audit_trail');
  console.log('Audit trail table dropped successfully');
}

module.exports = { up, down };
