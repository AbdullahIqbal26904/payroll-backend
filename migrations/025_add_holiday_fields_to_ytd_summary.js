/**
 * Migration: 025_add_holiday_fields_to_ytd_summary.js
 * 
 * Purpose: Add holiday hours and amount fields to employee_ytd_summary table
 * This migration adds fields to track paid public holidays in YTD summaries
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Add holiday fields to employee_ytd_summary table
  await connection.query(`
    ALTER TABLE employee_ytd_summary 
    ADD COLUMN ytd_holiday_hours DECIMAL(10, 2) DEFAULT 0 AFTER ytd_vacation_amount,
    ADD COLUMN ytd_holiday_amount DECIMAL(10, 2) DEFAULT 0 AFTER ytd_holiday_hours
  `);
  
  console.log('Added holiday fields to employee_ytd_summary table');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove holiday fields from employee_ytd_summary table
  await connection.query(`
    ALTER TABLE employee_ytd_summary 
    DROP COLUMN ytd_holiday_hours,
    DROP COLUMN ytd_holiday_amount
  `);
  
  console.log('Removed holiday fields from employee_ytd_summary table');
}

module.exports = { up, down };
