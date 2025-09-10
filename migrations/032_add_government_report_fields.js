/**
 * Migration: 032_add_government_report_fields.js
 * 
 * Purpose: Add fields needed for government reports to employees and payroll_settings tables
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    // Step 1: Add fields to employees table
    console.log('Adding social security and medical benefits numbers to employees table...');
    
    // Check if the columns already exist in employees table
    const [ssColumns] = await connection.query(`
      SHOW COLUMNS FROM employees LIKE 'social_security_no'
    `);
    
    if (ssColumns.length === 0) {
      await connection.query(`
        ALTER TABLE employees 
        ADD COLUMN social_security_no VARCHAR(30) NULL,
        ADD COLUMN medical_benefits_no VARCHAR(30) NULL,
        ADD INDEX idx_social_security_no (social_security_no),
        ADD INDEX idx_medical_benefits_no (medical_benefits_no)
      `);
      console.log('Added social security and medical benefits fields to employees table');
    } else {
      console.log('Social security and medical benefits fields already exist in employees table');
    }
    
    // Step 2: Add report numbering fields to payroll_settings table
    console.log('Adding report numbering fields to payroll_settings table...');
    
    const [reportColumns] = await connection.query(`
      SHOW COLUMNS FROM payroll_settings LIKE 'ss_report_number_base'
    `);
    
    if (reportColumns.length === 0) {
      await connection.query(`
        ALTER TABLE payroll_settings 
        ADD COLUMN ss_report_number_base VARCHAR(20) DEFAULT 'SS-',
        ADD COLUMN ss_report_number_current INT DEFAULT 1000,
        ADD COLUMN ss_report_auto_increment BOOLEAN DEFAULT TRUE,
        ADD COLUMN mb_report_number_base VARCHAR(20) DEFAULT 'MB-',
        ADD COLUMN mb_report_number_current INT DEFAULT 1000,
        ADD COLUMN mb_report_auto_increment BOOLEAN DEFAULT TRUE,
        ADD COLUMN el_report_number_base VARCHAR(20) DEFAULT 'EL-',
        ADD COLUMN el_report_number_current INT DEFAULT 1000,
        ADD COLUMN el_report_auto_increment BOOLEAN DEFAULT TRUE
      `);
      console.log('Added report numbering fields to payroll_settings table');
    } else {
      console.log('Report numbering fields already exist in payroll_settings table');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
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
    // Remove fields from employees table
    await connection.query(`
      ALTER TABLE employees 
      DROP COLUMN social_security_no,
      DROP COLUMN medical_benefits_no
    `);
    console.log('Removed social security and medical benefits fields from employees table');
    
    // Remove report numbering fields from payroll_settings table
    await connection.query(`
      ALTER TABLE payroll_settings 
      DROP COLUMN ss_report_number_base,
      DROP COLUMN ss_report_number_current,
      DROP COLUMN ss_report_auto_increment,
      DROP COLUMN mb_report_number_base,
      DROP COLUMN mb_report_number_current,
      DROP COLUMN mb_report_auto_increment,
      DROP COLUMN el_report_number_base,
      DROP COLUMN el_report_number_current,
      DROP COLUMN el_report_auto_increment
    `);
    console.log('Removed report numbering fields from payroll_settings table');
    
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

module.exports = { up, down };
