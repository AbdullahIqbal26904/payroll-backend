/**
 * Department Controller
 * Handles operations related to departments
 */
const db = require('../config/db');

/**
 * Get all departments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with departments
 */
exports.getAllDepartments = async (req, res) => {
  try {
    const [departments] = await db.query(`
      SELECT id, name, code, description, created_at, updated_at
      FROM departments
      ORDER BY name ASC
    `);
    
    return res.status(200).json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error.message
    });
  }
};

/**
 * Get department by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with department details
 */
exports.getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [departments] = await db.query(`
      SELECT id, name, code, description, created_at, updated_at
      FROM departments
      WHERE id = ?
    `, [id]);
    
    if (departments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: departments[0]
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch department',
      error: error.message
    });
  }
};

/**
 * Create a new department
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with created department
 */
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }
    
    // Start a transaction
    await db.query('START TRANSACTION');
    
    const [result] = await db.query(`
      INSERT INTO departments (name, code, description)
      VALUES (?, ?, ?)
    `, [name, code || null, description || null]);
    
    const [newDepartment] = await db.query(`
      SELECT id, name, code, description, created_at, updated_at
      FROM departments
      WHERE id = ?
    `, [result.insertId]);
    
    // Commit the transaction
    await db.query('COMMIT');
    
    return res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: newDepartment[0]
    });
  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    console.error('Error creating department:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A department with this name already exists',
        error: 'Duplicate entry'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create department',
      error: error.message
    });
  }
};

/**
 * Update an existing department
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response with updated department
 */
exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }
    
    // Start a transaction
    await db.query('START TRANSACTION');
    
    // Check if department exists
    const [existingDept] = await db.query(`
      SELECT id FROM departments WHERE id = ?
    `, [id]);
    
    if (existingDept.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    await db.query(`
      UPDATE departments
      SET name = ?, code = ?, description = ?
      WHERE id = ?
    `, [name, code || null, description || null, id]);
    
    const [updatedDepartment] = await db.query(`
      SELECT id, name, code, description, created_at, updated_at
      FROM departments
      WHERE id = ?
    `, [id]);
    
    // Commit the transaction
    await db.query('COMMIT');
    
    return res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: updatedDepartment[0]
    });
  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    console.error('Error updating department:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'A department with this name already exists',
        error: 'Duplicate entry'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to update department',
      error: error.message
    });
  }
};

/**
 * Delete a department
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} JSON response confirming deletion
 */
exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Start a transaction
    await db.query('START TRANSACTION');
    
    // Check if department exists
    const [existingDept] = await db.query(`
      SELECT id FROM departments WHERE id = ?
    `, [id]);
    
    if (existingDept.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Check if department is being used by any employees
    const [employeesUsingDept] = await db.query(`
      SELECT COUNT(*) as count FROM employees WHERE department_id = ?
    `, [id]);
    
    if (employeesUsingDept[0].count > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department that is assigned to employees',
        employeeCount: employeesUsingDept[0].count
      });
    }
    
    await db.query(`
      DELETE FROM departments WHERE id = ?
    `, [id]);
    
    // Commit the transaction
    await db.query('COMMIT');
    
    return res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    // Rollback on error
    await db.query('ROLLBACK');
    console.error('Error deleting department:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete department',
      error: error.message
    });
  }
};
