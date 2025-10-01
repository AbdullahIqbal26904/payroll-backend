/**
 * Migration: 035_add_ytd_holiday_fields_to_payroll_items.js
 * 
 * Purpose: Add YTD holiday hours and amount fields to payroll_items table
 * This migration adds YTD fields to track year-to-date paid public holidays in payroll items
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Add YTD holiday fields to payroll_items table
  await connection.query(`
    ALTER TABLE payroll_items 
    ADD COLUMN ytd_holiday_hours DECIMAL(10, 2) DEFAULT 0 AFTER ytd_vacation_amount,
    ADD COLUMN ytd_holiday_amount DECIMAL(10, 2) DEFAULT 0 AFTER ytd_holiday_hours
  `);
  
  console.log('Added YTD holiday fields to payroll_items table');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove YTD holiday fields from payroll_items table
  await connection.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN ytd_holiday_hours,
    DROP COLUMN ytd_holiday_amount
  `);
  
  console.log('Removed YTD holiday fields from payroll_items table');
}

module.exports = { up, down };
