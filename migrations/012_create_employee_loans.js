/**
 * Migration to create employee loans table
 * 
 * This migration adds support for tracking employee loans and their repayments
 * through payroll deductions
 */

async function up(connection) {
  try {
    // Create employee_loans table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS employee_loans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(20) NOT NULL,
        loan_amount DECIMAL(10, 2) NOT NULL,
        interest_rate DECIMAL(5, 2) NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        remaining_amount DECIMAL(10, 2) NOT NULL,
        installment_amount DECIMAL(10, 2) NOT NULL,
        start_date DATE NOT NULL,
        expected_end_date DATE NOT NULL,
        status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Created employee_loans table');
    
    // Create loan_payments table to track individual payments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS loan_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        loan_id INT NOT NULL,
        payroll_item_id INT NOT NULL,
        payment_amount DECIMAL(10, 2) NOT NULL,
        payment_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES employee_loans(id) ON DELETE CASCADE,
        FOREIGN KEY (payroll_item_id) REFERENCES payroll_items(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('Created loan_payments table');
    
    // Add loan_deduction column to payroll_items table
    await connection.query(`
      ALTER TABLE payroll_items 
      ADD COLUMN loan_deduction DECIMAL(10, 2) DEFAULT 0.00 AFTER education_levy
    `);
    
    console.log('Added loan_deduction column to payroll_items table');
    
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

async function down(connection) {
  try {
    // Drop loan_payments table first due to foreign key constraint
    await connection.query(`DROP TABLE IF EXISTS loan_payments`);
    
    // Drop employee_loans table
    await connection.query(`DROP TABLE IF EXISTS employee_loans`);
    
    // Remove loan_deduction column from payroll_items
    await connection.query(`
      ALTER TABLE payroll_items 
      DROP COLUMN loan_deduction
    `);
    
    console.log('Removed employee loans tables and columns');
    
    return true;
  } catch (error) {
    console.error('Migration reversal failed:', error);
    return false;
  }
}

module.exports = { up, down };
