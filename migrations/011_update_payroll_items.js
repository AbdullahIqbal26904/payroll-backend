/**
 * Migration: 011_update_payroll_items.js
 * 
 * Purpose: Update payroll_items table to include total employer contributions
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Check if the column already exists
  const [columns] = await connection.query(`
    SHOW COLUMNS FROM payroll_items LIKE 'total_employer_contributions'
  `);
  
  if (columns.length === 0) {
    // Add total_employer_contributions field
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN total_employer_contributions DECIMAL(10, 2) DEFAULT 0.00 AFTER education_levy
    `);
    
    // Update existing records to calculate the value
    await connection.query(`
      UPDATE payroll_items
      SET total_employer_contributions = social_security_employer + medical_benefits_employer
    `);
    
    console.log('Updated payroll_items table with total_employer_contributions field');
  } else {
    console.log('Field already exists, skipping migration');
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN total_employer_contributions
  `);
  
  console.log('Removed total_employer_contributions field from payroll_items table');
}

module.exports = { up, down };
