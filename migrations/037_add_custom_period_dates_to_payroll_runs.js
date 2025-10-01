/**
 * Migration: Add custom period date columns to payroll_runs table
 * 
 * Purpose: Store custom period dates when payroll is calculated with different
 * dates than the timesheet period defaults. This allows paystubs to show the
 * actual dates used for calculation.
 */

exports.up = async function(db) {
  await db.query(`
    ALTER TABLE payroll_runs
    ADD COLUMN custom_period_start DATE NULL COMMENT 'Custom period start date if different from timesheet period',
    ADD COLUMN custom_period_end DATE NULL COMMENT 'Custom period end date if different from timesheet period'
  `);
  
  console.log('Added custom_period_start and custom_period_end columns to payroll_runs table');
};

exports.down = async function(db) {
  await db.query(`
    ALTER TABLE payroll_runs
    DROP COLUMN custom_period_start,
    DROP COLUMN custom_period_end
  `);
  
  console.log('Removed custom_period_start and custom_period_end columns from payroll_runs table');
};
