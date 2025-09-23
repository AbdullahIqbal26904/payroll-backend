/**
 * Migration: Add override functionality to payroll items
 * This migration adds columns to support manual overrides in payroll calculations
 */

exports.up = async function(db) {
  // Add override columns to payroll_items table
  await db.query(`
    ALTER TABLE payroll_items 
    ADD COLUMN is_override BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN override_amount DECIMAL(10,2) NULL,
    ADD COLUMN override_reason VARCHAR(255) NULL,
    ADD COLUMN override_by INT NULL,
    ADD COLUMN override_at TIMESTAMP NULL,
    ADD FOREIGN KEY (override_by) REFERENCES users(id) ON DELETE SET NULL
  `);
  
  console.log('Added override columns to payroll_items table');
  
  return Promise.resolve();
};

exports.down = async function(db) {
  // Remove the override columns
  await db.query(`
    ALTER TABLE payroll_items 
    DROP FOREIGN KEY payroll_items_ibfk_3,
    DROP COLUMN override_at,
    DROP COLUMN override_by,
    DROP COLUMN override_reason,
    DROP COLUMN override_amount,
    DROP COLUMN is_override
  `);
  
  console.log('Removed override columns from payroll_items table');
  
  return Promise.resolve();
};