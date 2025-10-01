/**
 * Migration: 008_create_default_data.js
 * 
 * Purpose: Insert default data into the database
 * This includes an admin user and default payroll settings for Antigua
 * 
 * Warning: Requires bcrypt module for password hashing
 */

const bcrypt = require('bcrypt');

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  try {
    // Check if admin user already exists
    const [users] = await connection.query(`
      SELECT id FROM users WHERE email = 'info@medsaas.com'
    `);
    
    // Create default admin user if not exists
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await connection.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('System Admin', 'info@medsaas.com', ?, 'admin')
      `, [hashedPassword]);
      
      console.log('Default admin user created successfully');
    } else {
      console.log('Default admin user already exists, skipping creation');
    }
    
    // Check if payroll settings exist
    const [settings] = await connection.query(`
      SELECT id FROM payroll_settings LIMIT 1
    `);
    
    // Insert default payroll settings if not exists
    if (settings.length === 0) {
      await connection.query(`
        INSERT INTO payroll_settings (
          social_security_employee_rate,
          social_security_employer_rate,
          social_security_max_insurable,
          medical_benefits_employee_rate,
          medical_benefits_employer_rate,
          medical_benefits_employee_senior_rate,
          education_levy_rate,
          education_levy_high_rate,
          education_levy_threshold,
          education_levy_exemption,
          retirement_age,
          medical_benefits_senior_age,
          medical_benefits_max_age
        ) VALUES (
          7.00, 9.00, 6500.00,
          3.50, 3.50, 2.50,
          2.50, 5.00, 5000.00, 541.67,
          65, 60, 70
        )
      `);
      
      console.log('Default payroll settings created successfully');
    } else {
      console.log('Payroll settings already exist, skipping creation');
    }
    
    // Insert common system settings if they don't exist
    const settingsToInsert = [
      {
        name: 'company_name',
        value: 'Antigua Payroll System',
        description: 'Name of the company using the payroll system'
      },
      {
        name: 'company_address',
        value: 'St. John\'s, Antigua and Barbuda',
        description: 'Address of the company'
      },
      {
        name: 'company_phone',
        value: '+1 (268) 123-4567',
        description: 'Contact phone number'
      },
      {
        name: 'paystub_footer',
        value: 'This is a computer-generated document and does not require a signature.',
        description: 'Text displayed at the bottom of paystubs'
      }
    ];
    
    for (const setting of settingsToInsert) {
      const [existingSetting] = await connection.query(`
        SELECT id FROM settings WHERE setting_name = ?
      `, [setting.name]);
      
      if (existingSetting.length === 0) {
        await connection.query(`
          INSERT INTO settings (setting_name, setting_value, description)
          VALUES (?, ?, ?)
        `, [setting.name, setting.value, setting.description]);
        
        console.log(`Setting '${setting.name}' created successfully`);
      } else {
        console.log(`Setting '${setting.name}' already exists, skipping creation`);
      }
    }
    
    console.log('All default data created successfully');
  } catch (error) {
    console.error('Error creating default data:', error);
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
    // Remove default admin user
    await connection.query(`
      DELETE FROM users WHERE email = 'info@medsaas.com'
    `);
    console.log('Default admin user removed successfully');
    
    // Clear payroll settings
    await connection.query('TRUNCATE TABLE payroll_settings');
    console.log('Payroll settings cleared successfully');
    
    // Remove default system settings
    const defaultSettingNames = [
      'company_name',
      'company_address',
      'company_phone',
      'paystub_footer'
    ];
    
    for (const name of defaultSettingNames) {
      await connection.query('DELETE FROM settings WHERE setting_name = ?', [name]);
      console.log(`Setting '${name}' removed successfully`);
    }
  } catch (error) {
    console.error('Error removing default data:', error);
    throw error;
  }
}

module.exports = { up, down };
