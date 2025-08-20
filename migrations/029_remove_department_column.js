/**
 * Migration: 029_remove_department_column.js
 * 
 * Purpose: Remove the redundant department column from employees table
 * since we now have department_id as a foreign key to the departments table.
 * This migration ensures all employees have a valid department_id before
 * removing the department column.
 */

/**
 * Apply the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function up(connection) {
  console.log('Starting migration: remove department column from employees table');
  
  try {
    // Step 1: Check for employees without a department_id but with a department name
    const [employeesWithoutDeptId] = await connection.query(`
      SELECT id, first_name, last_name, department, department_id
      FROM employees
      WHERE department_id IS NULL AND department IS NOT NULL AND department != ''
    `);
    
    console.log(`Found ${employeesWithoutDeptId.length} employees with department name but no department_id`);
    
    // Step 2: For each employee without department_id, try to find a matching department and set it
    for (const employee of employeesWithoutDeptId) {
      // Look for a department with a matching name
      const [matchingDept] = await connection.query(`
        SELECT id FROM departments WHERE name = ?
      `, [employee.department]);
      
      if (matchingDept.length > 0) {
        // Update the employee with the found department_id
        await connection.query(`
          UPDATE employees 
          SET department_id = ? 
          WHERE id = ?
        `, [matchingDept[0].id, employee.id]);
        
        console.log(`Updated employee ${employee.id} (${employee.first_name} ${employee.last_name}) with department_id ${matchingDept[0].id}`);
      } else {
        // No matching department found, create a new one
        console.log(`No matching department found for "${employee.department}", creating one`);
        
        const [result] = await connection.query(`
          INSERT INTO departments (name, code, description)
          VALUES (?, ?, ?)
        `, [employee.department, employee.department.substring(0, 20), `Auto-created from employee data`]);
        
        // Update employee with the new department_id
        await connection.query(`
          UPDATE employees 
          SET department_id = ? 
          WHERE id = ?
        `, [result.insertId, employee.id]);
        
        console.log(`Created new department with ID ${result.insertId} and updated employee ${employee.id}`);
      }
    }
    
    // Step 3: Set default department_id for any NULL values
    const [deptIdColumnInfo] = await connection.query(`
      SHOW COLUMNS FROM employees LIKE 'department_id'
    `);
    
    if (deptIdColumnInfo.length > 0) {
      // Set NULL department_ids to a default department (Administration/ID 1)
      await connection.query(`
        UPDATE employees
        SET department_id = 1
        WHERE department_id IS NULL
      `);
      
      console.log('Set default department for employees with NULL department_id');
      
      // Note: We can't make department_id NOT NULL because it's part of a foreign key constraint
      // with ON DELETE SET NULL. We'd need to modify the constraint first, but that's a more
      // complex change that might not be necessary for this migration.
    }
    
    // Step 4: Remove the department column
    const [deptColumnInfo] = await connection.query(`
      SHOW COLUMNS FROM employees LIKE 'department'
    `);
    
    if (deptColumnInfo.length > 0) {
      await connection.query(`
        ALTER TABLE employees
        DROP COLUMN department
      `);
      
      console.log('Removed department column from employees table');
    } else {
      console.log('Department column does not exist, skipping drop');
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

/**
 * Rollback the migration
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function down(connection) {
  console.log('Rolling back: add department column to employees table');
  
  try {
    // Check if department column exists
    const [deptColumnInfo] = await connection.query(`
      SHOW COLUMNS FROM employees LIKE 'department'
    `);
    
    if (deptColumnInfo.length === 0) {
      // Add the department column back
      await connection.query(`
        ALTER TABLE employees
        ADD COLUMN department VARCHAR(100) AFTER employee_type
      `);
      
      console.log('Added department column back to employees table');
      
      // Restore department names from departments table
      await connection.query(`
        UPDATE employees e
        JOIN departments d ON e.department_id = d.id
        SET e.department = d.name
      `);
      
      console.log('Restored department names from departments table');
    } else {
      console.log('Department column already exists, skipping creation');
    }
    
    // Make department_id nullable again if it's currently NOT NULL
    const [deptIdColumnInfo] = await connection.query(`
      SHOW COLUMNS FROM employees LIKE 'department_id'
    `);
    
    if (deptIdColumnInfo.length > 0 && deptIdColumnInfo[0].Null === 'NO') {
      await connection.query(`
        ALTER TABLE employees
        MODIFY department_id INT NULL
      `);
      
      console.log('Made department_id nullable again');
    }
    
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Error during rollback:', error);
    throw error;
  }
}

module.exports = { up, down };
