/**
 * Migration: 009_create_utility_functions.js
 * 
 * Purpose: Create utility functions in MySQL for payroll calculations
 * These functions help with converting time formats and performing calculations
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    console.log('Creating utility functions...');
    
    // Create function to convert time string (HH:MM) to decimal hours
    await connection.query(`
      DROP FUNCTION IF EXISTS CONVERT_TIME_TO_DECIMAL;
    `);
    
    await connection.query(`
      CREATE FUNCTION CONVERT_TIME_TO_DECIMAL(time_str VARCHAR(20))
      RETURNS DECIMAL(10,2)
      DETERMINISTIC
      BEGIN
        DECLARE hours DECIMAL(10,2) DEFAULT 0;
        DECLARE minutes DECIMAL(10,2) DEFAULT 0;
        
        -- Extract hours and minutes from format like "8:30" or "08:30"
        IF time_str REGEXP '^[0-9]{1,2}:[0-9]{2}$' THEN
          SET hours = SUBSTRING_INDEX(time_str, ':', 1);
          SET minutes = SUBSTRING_INDEX(time_str, ':', -1) / 60;
          RETURN hours + minutes;
        
        -- If format is different or NULL, return 0
        ELSE
          RETURN 0;
        END IF;
      END;
    `);
    
    console.log('Created CONVERT_TIME_TO_DECIMAL function');
    
    // Create function to calculate age based on date of birth
    await connection.query(`
      DROP FUNCTION IF EXISTS CALCULATE_AGE;
    `);
    
    await connection.query(`
      CREATE FUNCTION CALCULATE_AGE(birth_date DATE)
      RETURNS INT
      DETERMINISTIC
      BEGIN
        RETURN TIMESTAMPDIFF(YEAR, birth_date, CURDATE());
      END;
    `);
    
    console.log('Created CALCULATE_AGE function');
    
    // Create stored procedure to update hours_decimal in timesheet_entries
    await connection.query(`
      DROP PROCEDURE IF EXISTS UPDATE_HOURS_DECIMAL;
    `);
    
    await connection.query(`
      CREATE PROCEDURE UPDATE_HOURS_DECIMAL()
      BEGIN
        UPDATE timesheet_entries
        SET hours_decimal = CONVERT_TIME_TO_DECIMAL(total_hours)
        WHERE hours_decimal = 0 AND total_hours IS NOT NULL;
      END;
    `);
    
    console.log('Created UPDATE_HOURS_DECIMAL procedure');
    
    // Create trigger to auto-update hours_decimal when inserting new timesheet entries
    await connection.query(`
      DROP TRIGGER IF EXISTS before_timesheet_entry_insert;
    `);
    
    await connection.query(`
      CREATE TRIGGER before_timesheet_entry_insert
      BEFORE INSERT ON timesheet_entries
      FOR EACH ROW
      BEGIN
        IF NEW.total_hours IS NOT NULL AND (NEW.hours_decimal IS NULL OR NEW.hours_decimal = 0) THEN
          SET NEW.hours_decimal = CONVERT_TIME_TO_DECIMAL(NEW.total_hours);
        END IF;
      END;
    `);
    
    console.log('Created before_timesheet_entry_insert trigger');
    
    // Create trigger to auto-update hours_decimal when updating timesheet entries
    await connection.query(`
      DROP TRIGGER IF EXISTS before_timesheet_entry_update;
    `);
    
    await connection.query(`
      CREATE TRIGGER before_timesheet_entry_update
      BEFORE UPDATE ON timesheet_entries
      FOR EACH ROW
      BEGIN
        IF NEW.total_hours IS NOT NULL AND NEW.total_hours != OLD.total_hours THEN
          SET NEW.hours_decimal = CONVERT_TIME_TO_DECIMAL(NEW.total_hours);
        END IF;
      END;
    `);
    
    console.log('Created before_timesheet_entry_update trigger');
    
    console.log('All utility functions created successfully');
  } catch (error) {
    console.error('Error creating utility functions:', error);
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
    // Drop triggers first (they depend on functions)
    await connection.query(`DROP TRIGGER IF EXISTS before_timesheet_entry_update`);
    await connection.query(`DROP TRIGGER IF EXISTS before_timesheet_entry_insert`);
    
    // Drop procedure
    await connection.query(`DROP PROCEDURE IF EXISTS UPDATE_HOURS_DECIMAL`);
    
    // Drop functions
    await connection.query(`DROP FUNCTION IF EXISTS CALCULATE_AGE`);
    await connection.query(`DROP FUNCTION IF EXISTS CONVERT_TIME_TO_DECIMAL`);
    
    console.log('All utility functions dropped successfully');
  } catch (error) {
    console.error('Error dropping utility functions:', error);
    throw error;
  }
}

module.exports = { up, down };
