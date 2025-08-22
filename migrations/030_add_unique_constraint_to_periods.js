/**
 * Migration: 030_add_unique_constraint_to_periods.js
 * 
 * Purpose: Add a unique constraint to timesheet periods to prevent duplicate period uploads
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    // Check if the unique index already exists
    const [indexInfo] = await connection.query(`
      SHOW INDEX FROM timesheet_periods WHERE Key_name = 'uniq_period_dates'
    `);

    if (indexInfo.length === 0) {
      // Add a unique constraint on period_start and period_end columns
      await connection.query(`
        ALTER TABLE timesheet_periods 
        ADD CONSTRAINT uniq_period_dates 
        UNIQUE (period_start, period_end)
      `);
      
      console.log('Added unique constraint to timesheet_periods table');
    } else {
      console.log('Unique constraint already exists on timesheet_periods, skipping');
    }
  } catch (error) {
    console.error('Error adding unique constraint:', error);
    throw error;
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  try {
    // Remove the unique constraint
    await connection.query(`
      ALTER TABLE timesheet_periods 
      DROP CONSTRAINT IF EXISTS uniq_period_dates
    `);
    
    console.log('Removed unique constraint from timesheet_periods table');
  } catch (error) {
    console.error('Error removing unique constraint:', error);
    throw error;
  }
}

module.exports = { up, down };
