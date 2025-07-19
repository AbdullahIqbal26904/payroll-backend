/**
 * Migration to add employee loan deduction system
 * This migration adds tables for tracking employee loans and loan payments,
 * and updates the payroll_items table to include loan deduction tracking.
 */
async function up(db) {
  console.log('Creating employee_loans table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS employee_loans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id VARCHAR(255) NOT NULL,
      loan_amount DECIMAL(10, 2) NOT NULL,
      interest_rate DECIMAL(5, 2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(10, 2) NOT NULL,
      remaining_amount DECIMAL(10, 2) NOT NULL,
      installment_amount DECIMAL(10, 2) NOT NULL,
      start_date DATE NOT NULL,
      expected_end_date DATE NOT NULL,
      status ENUM('active', 'completed', 'cancelled', 'paused') NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('Creating loan_payments table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS loan_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      loan_id INT NOT NULL,
      payroll_item_id INT NOT NULL,
      payment_amount DECIMAL(10, 2) NOT NULL,
      principal_amount DECIMAL(10, 2) NOT NULL,
      interest_amount DECIMAL(10, 2) NOT NULL,
      payment_date DATE NOT NULL,
      remaining_balance DECIMAL(10, 2) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (loan_id) REFERENCES employee_loans(id) ON DELETE CASCADE,
      FOREIGN KEY (payroll_item_id) REFERENCES payroll_items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('Updating payroll_items table to include loan_deduction column...');
  // await db.query(`
  //   ALTER TABLE payroll_items 
  //   ADD COLUMN loan_deduction DECIMAL(10, 2) DEFAULT 0.00 AFTER education_levy;
  // `);

  console.log('Migration complete!');
}

async function down(db) {
  console.log('Removing loan_deduction column from payroll_items...');
  await db.query(`
    ALTER TABLE payroll_items 
    DROP COLUMN loan_deduction;
  `);

  console.log('Dropping loan_payments table...');
  await db.query(`DROP TABLE IF EXISTS loan_payments;`);

  console.log('Dropping employee_loans table...');
  await db.query(`DROP TABLE IF EXISTS employee_loans;`);

  console.log('Rollback complete!');
}

module.exports = { up, down };
