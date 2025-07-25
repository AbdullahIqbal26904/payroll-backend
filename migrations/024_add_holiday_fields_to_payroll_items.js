/**
 * Migration: 024_add_holiday_fields_to_payroll_items.js
 * 
 * Purpose: Add holiday hours and amount fields to payroll_items table
 * This migration adds fields to track paid public holidays in payroll items
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Add holiday fields to payroll_items table
  await connection.query(`
    ALTER TABLE payroll_items 
    ADD COLUMN holiday_hours DECIMAL(10, 2) DEFAULT 0 AFTER vacation_amount,
    ADD COLUMN holiday_amount DECIMAL(10, 2) DEFAULT 0 AFTER holiday_hours
  `);
  
  console.log('Added holiday fields to payroll_items table');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove holiday fields from payroll_items table
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN holiday_hours,
    DROP COLUMN holiday_amount
  `);
  
  console.log('Removed holiday fields from payroll_items table');
}

module.exports = { up, down };
