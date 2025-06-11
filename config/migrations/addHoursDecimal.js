const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function migrate() {
  try {
    // Create connection to MySQL server
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    
    console.log('Connected to database. Running migration...');
    
    // Check if timesheet_entries table exists
    const [tables] = await connection.query(`
      SHOW TABLES LIKE 'timesheet_entries'
    `);
    
    if (tables.length === 0) {
      console.log('timesheet_entries table does not exist yet. Creating table...');
      
      // Create timesheet_periods table first if it doesn't exist
      await connection.query(`
        CREATE TABLE IF NOT EXISTS timesheet_periods (
          id INT AUTO_INCREMENT PRIMARY KEY,
          report_title VARCHAR(255) DEFAULT 'Timesheet Report',
          period_start DATE,
          period_end DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_by INT,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      
      // Create timesheet_entries table with hours_decimal included
      await connection.query(`
        CREATE TABLE IF NOT EXISTS timesheet_entries (
          id INT AUTO_INCREMENT PRIMARY KEY,
          period_id INT,
          employee_id VARCHAR(20),
          last_name VARCHAR(50),
          first_name VARCHAR(50),
          work_date DATE,
          time_in VARCHAR(20),
          time_out VARCHAR(20),
          total_hours VARCHAR(20),
          hours_decimal DECIMAL(10, 2) DEFAULT 0.00,
          dept_code VARCHAR(20),
          in_location VARCHAR(100),
          in_punch_method VARCHAR(50),
          out_location VARCHAR(100),
          out_punch_method VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (period_id) REFERENCES timesheet_periods(id) ON DELETE CASCADE
        )
      `);
      
      console.log('Created timesheet_entries table with hours_decimal column.');
    } else {
      // Check if hours_decimal column already exists
      const [columns] = await connection.query(`
        SHOW COLUMNS FROM timesheet_entries LIKE 'hours_decimal'
      `);
      
      if (columns.length === 0) {
        console.log('Adding hours_decimal column to timesheet_entries table...');
        
        await connection.query(`
          ALTER TABLE timesheet_entries
          ADD COLUMN hours_decimal DECIMAL(10, 2) DEFAULT 0.00
          AFTER total_hours
        `);
        
        console.log('Added hours_decimal column successfully.');
      } else {
        console.log('hours_decimal column already exists.');
      }
    }
    
    // Create payroll_items table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payroll_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payroll_run_id INT,
        employee_id INT,
        employee_name VARCHAR(100),
        hours_worked DECIMAL(10, 2) DEFAULT 0.00,
        gross_pay DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employee DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employer DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employee DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employer DECIMAL(10, 2) DEFAULT 0.00,
        education_levy DECIMAL(10, 2) DEFAULT 0.00,
        net_pay DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
      )
    `);
    
    console.log('Migration completed successfully.');
    await connection.end();
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
