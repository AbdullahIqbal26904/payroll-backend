const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');

dotenv.config();

async function initializeDatabase() {
  try {
    // Create connection to MySQL server (without database)
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    // Create the database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    
    // Use the database
    await connection.query(`USE ${process.env.DB_NAME}`);
    
    // Create users table with roles (admin, employee)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'employee') NOT NULL DEFAULT 'employee',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create employees table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        employee_id VARCHAR(20) UNIQUE,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        date_of_birth DATE,
        gender ENUM('Male', 'Female', 'Other'),
        address TEXT,
        phone VARCHAR(20),
        hire_date DATE,
        job_title VARCHAR(100),
        department VARCHAR(100),
        salary_amount DECIMAL(10, 2) DEFAULT 0.00,
        payment_frequency ENUM('Monthly', 'Bi-Weekly') DEFAULT 'Monthly',
        date_of_birth_for_age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Create payroll table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payrolls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id INT,
        pay_period_start DATE,
        pay_period_end DATE,
        payment_date DATE,
        gross_salary DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employee DECIMAL(10, 2) DEFAULT 0.00,
        social_security_employer DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employee DECIMAL(10, 2) DEFAULT 0.00,
        medical_benefits_employer DECIMAL(10, 2) DEFAULT 0.00,
        education_levy DECIMAL(10, 2) DEFAULT 0.00,
        net_salary DECIMAL(10, 2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        status ENUM('pending', 'processed', 'paid') DEFAULT 'pending',
        created_by INT,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Create audit trail table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        action VARCHAR(255) NOT NULL,
        entity VARCHAR(50) NOT NULL,
        entity_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // Create system settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_name VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // Create payroll settings table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payroll_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        social_security_employee_rate DECIMAL(5, 2) DEFAULT 7.00,
        social_security_employer_rate DECIMAL(5, 2) DEFAULT 9.00,
        social_security_max_insurable DECIMAL(10, 2) DEFAULT 6500.00,
        medical_benefits_employee_rate DECIMAL(5, 2) DEFAULT 3.50,
        medical_benefits_employer_rate DECIMAL(5, 2) DEFAULT 3.50,
        medical_benefits_employee_senior_rate DECIMAL(5, 2) DEFAULT 2.50,
        education_levy_rate DECIMAL(5, 2) DEFAULT 2.50,
        education_levy_high_rate DECIMAL(5, 2) DEFAULT 5.00,
        education_levy_threshold DECIMAL(10, 2) DEFAULT 5000.00,
        education_levy_exemption DECIMAL(10, 2) DEFAULT 541.67,
        retirement_age INT DEFAULT 65,
        medical_benefits_senior_age INT DEFAULT 60,
        medical_benefits_max_age INT DEFAULT 70,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert default payroll settings
    await connection.query(`
      INSERT INTO payroll_settings 
      (social_security_employee_rate, social_security_employer_rate, social_security_max_insurable,
       medical_benefits_employee_rate, medical_benefits_employer_rate, medical_benefits_employee_senior_rate,
       education_levy_rate, education_levy_high_rate, education_levy_threshold, education_levy_exemption,
       retirement_age, medical_benefits_senior_age, medical_benefits_max_age)
      VALUES (7.00, 9.00, 6500.00, 3.50, 3.50, 2.50, 2.50, 5.00, 5000.00, 541.67, 65, 60, 70)
      ON DUPLICATE KEY UPDATE
        updated_at = CURRENT_TIMESTAMP
    `);
    
    // Create default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Check if admin exists before inserting
    const [rows] = await connection.query(`SELECT id FROM users WHERE email = 'admin@payroll.com'`);
    
    if (rows.length === 0) {
      await connection.query(`
        INSERT INTO users (name, email, password, role)
        VALUES ('System Admin', 'admin@payroll.com', ?, 'admin')
      `, [hashedPassword]);
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
    
    console.log('Database initialized successfully');
    await connection.end();
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

module.exports = { initializeDatabase };
