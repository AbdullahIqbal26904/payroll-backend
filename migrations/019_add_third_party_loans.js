/**
 * Migration: Add third party loans
 * This migration adds support for third-party loan types in the employee loans system
 */

exports.up = async function(db) {
  // Add loan_type column to employee_loans table
  await db.query(`
    ALTER TABLE employee_loans 
    ADD COLUMN loan_type ENUM('internal', 'third_party') NOT NULL DEFAULT 'internal',
    ADD COLUMN third_party_name VARCHAR(255) NULL,
    ADD COLUMN third_party_account_number VARCHAR(100) NULL,
    ADD COLUMN third_party_routing_number VARCHAR(100) NULL,
    ADD COLUMN third_party_reference VARCHAR(100) NULL
  `);
  
  // Add columns for tracking loan types in payroll items (as separate query)
  await db.query(`
    ALTER TABLE payroll_items
    ADD COLUMN internal_loan_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00
  `);
  
  await db.query(`
    ALTER TABLE payroll_items
    ADD COLUMN third_party_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00
  `);
  
  return Promise.resolve();
};

exports.down = async function(db) {
  // Remove the columns added to the payroll_items table (as separate queries)
  await db.query(`
    ALTER TABLE payroll_items
    DROP COLUMN internal_loan_deduction
  `);
  
  await db.query(`
    ALTER TABLE payroll_items
    DROP COLUMN third_party_deduction
  `);
  
  // Remove the columns added to the employee_loans table
  await db.query(`
    ALTER TABLE employee_loans 
    DROP COLUMN third_party_reference,
    DROP COLUMN third_party_routing_number, 
    DROP COLUMN third_party_account_number,
    DROP COLUMN third_party_name,
    DROP COLUMN loan_type
  `);
  
  return Promise.resolve();
};
