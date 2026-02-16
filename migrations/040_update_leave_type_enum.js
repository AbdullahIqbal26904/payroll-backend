/**
 * Migration: 040_update_leave_type_enum.js
 * 
 * Purpose: Update leave_type ENUM to include new leave types:
 * - maternity (Maternity Leave)
 * - compassionate (Compassionate Leave)
 * - uncertified_sick (Uncertified Sick Leave)
 * - certified_sick (Certified Sick Leave)
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the employee_leaves table exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employee_leaves'
  `);
  
  if (tables.length === 0) {
    console.log('Employee leaves table does not exist, skipping ENUM update.');
    return;
  }

  // First, update any existing 'sick' leave types to 'uncertified_sick'
  await connection.query(`
    UPDATE employee_leaves 
    SET leave_type = 'sick' 
    WHERE leave_type = 'sick'
  `);

  // Alter the leave_type column to include new ENUM values
  // This will convert old 'sick' values - we need to handle this carefully
  await connection.query(`
    ALTER TABLE employee_leaves 
    MODIFY COLUMN leave_type ENUM('sick', 'maternity', 'compassionate', 'uncertified_sick', 'certified_sick') NOT NULL
  `);

  // Migrate existing 'sick' entries to 'uncertified_sick'
  await connection.query(`
    UPDATE employee_leaves 
    SET leave_type = 'uncertified_sick' 
    WHERE leave_type = 'sick'
  `);

  // Now remove 'sick' from the ENUM since all records have been migrated
  await connection.query(`
    ALTER TABLE employee_leaves 
    MODIFY COLUMN leave_type ENUM('maternity', 'compassionate', 'uncertified_sick', 'certified_sick') NOT NULL
  `);
  
  console.log('Leave type ENUM updated successfully with new leave types');
}

/**
 * Revert the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Check if the employee_leaves table exists
  const [tables] = await connection.query(`
    SHOW TABLES LIKE 'employee_leaves'
  `);
  
  if (tables.length === 0) {
    console.log('Employee leaves table does not exist, skipping ENUM revert.');
    return;
  }

  // Add back 'sick' to ENUM temporarily
  await connection.query(`
    ALTER TABLE employee_leaves 
    MODIFY COLUMN leave_type ENUM('sick', 'maternity', 'compassionate', 'uncertified_sick', 'certified_sick') NOT NULL
  `);

  // Migrate 'uncertified_sick' and 'certified_sick' back to 'sick'
  await connection.query(`
    UPDATE employee_leaves 
    SET leave_type = 'sick' 
    WHERE leave_type IN ('uncertified_sick', 'certified_sick')
  `);

  // Migrate 'compassionate' to 'sick' as well (no equivalent in old schema)
  await connection.query(`
    UPDATE employee_leaves 
    SET leave_type = 'sick' 
    WHERE leave_type = 'compassionate'
  `);

  // Revert to original ENUM
  await connection.query(`
    ALTER TABLE employee_leaves 
    MODIFY COLUMN leave_type ENUM('sick', 'maternity') NOT NULL
  `);
  
  console.log('Leave type ENUM reverted to original values');
}

module.exports = { up, down };
