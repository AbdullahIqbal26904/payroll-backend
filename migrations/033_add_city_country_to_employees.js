/**
 * Migration: 033_add_city_country_to_employees.js
 * 
 * Purpose: Add city and country columns to the employees table for ACH reporting
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the columns already exist
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM employees WHERE Field IN ('city', 'country')
  `);
  
  if (columns.length === 2) {
    console.log('City and country columns already exist in employees table, skipping.');
    return;
  }

  // Add city and country columns
  if (!columns.find(col => col.Field === 'city')) {
    await connection.query(`
      ALTER TABLE employees
      ADD COLUMN city VARCHAR(100) DEFAULT NULL
    `);
    console.log('Added city column to employees table');
  }
  
  if (!columns.find(col => col.Field === 'country')) {
    await connection.query(`
      ALTER TABLE employees
      ADD COLUMN country VARCHAR(100) DEFAULT NULL
    `);
    console.log('Added country column to employees table');
  }
  
  console.log('City and country columns added to employees table successfully');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Drop the columns
  await connection.query(`
    ALTER TABLE employees
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS country
  `);
  console.log('City and country columns dropped from employees table');
}

module.exports = { up, down };