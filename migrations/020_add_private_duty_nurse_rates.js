/**
 * Migration: 020_add_private_duty_nurse_rates.js
 * 
 * Purpose: Add configurable rates for private duty nurses to payroll_settings table
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  // Add new columns for private duty nurse rates
  await connection.query(`
    ALTER TABLE payroll_settings 
    ADD COLUMN private_duty_nurse_day_weekday DECIMAL(5, 2) DEFAULT 35.00,
    ADD COLUMN private_duty_nurse_night_all DECIMAL(5, 2) DEFAULT 40.00,
    ADD COLUMN private_duty_nurse_day_weekend DECIMAL(5, 2) DEFAULT 40.00,
    ADD COLUMN private_duty_nurse_day_start TIME DEFAULT '07:00:00',
    ADD COLUMN private_duty_nurse_day_end TIME DEFAULT '19:00:00'
  `);
  
  console.log('Added private duty nurse rate settings to payroll_settings table');
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  // Remove the private duty nurse rate columns
  await connection.query(`
    ALTER TABLE payroll_settings 
    DROP COLUMN private_duty_nurse_day_weekday,
    DROP COLUMN private_duty_nurse_night_all,
    DROP COLUMN private_duty_nurse_day_weekend,
    DROP COLUMN private_duty_nurse_day_start,
    DROP COLUMN private_duty_nurse_day_end
  `);
  
  console.log('Removed private duty nurse rate settings from payroll_settings table');
}

module.exports = { up, down };
