const db = require('../config/db');
const { formatSuccess, formatError } = require('../utils/helpers');
const bcrypt = require('bcrypt');

/**
 * @desc    Add a new employee
 * @route   POST /api/employees
 * @access  Private/Admin
 */
exports.addEmployee = async (req, res) => {
  const { 
    first_name, 
    last_name, 
    email, 
    date_of_birth, 
    gender, 
    address, 
    phone, 
    hire_date, 
    job_title, 
    department, 
    salary_amount, 
    hourly_rate,
    payment_frequency,
    is_exempt_ss,
    is_exempt_medical,
    employee_id
  } = req.body;
  
  try {
    // Start transaction
    await db.query('START TRANSACTION');
    
    // Validate employee_id is provided
    if (!employee_id) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
    }
    
    // Check if employee_id already exists
    const [existingEmployee] = await db.query(
      'SELECT * FROM employees WHERE employee_id = ?',
      [employee_id]
    );
    
    if (existingEmployee.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'An employee with this Employee ID already exists'
      });
    }
    
    // Calculate age for date_of_birth_for_age
    let dateOfBirthForAge = null;
    if (date_of_birth) {
      const birthDate = new Date(date_of_birth);
      const ageDifMs = Date.now() - birthDate.getTime();
      const ageDate = new Date(ageDifMs);
      dateOfBirthForAge = Math.abs(ageDate.getUTCFullYear() - 1970);
    }
    
    // Create user account for employee if email is provided
    let userId = null;
    if (email) {
      // Check if user with email already exists
      const [existingUser] = await db.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
      
      if (existingUser.length > 0) {
        await db.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      
      // Generate password
      const defaultPassword = `${first_name.toLowerCase()}${last_name.toLowerCase()}123`;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPassword, salt);
      
      // Create user
      const [userResult] = await db.query(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [`${first_name} ${last_name}`, email, hashedPassword, 'employee']
      );
      
      userId = userResult.insertId;
    }
    
    // Create employee record
    const [result] = await db.query(
      `INSERT INTO employees 
       (user_id, employee_id, first_name, last_name, date_of_birth, gender, address, phone, email,
        hire_date, job_title, department, salary_amount, hourly_rate, payment_frequency, 
        is_exempt_ss, is_exempt_medical, date_of_birth_for_age) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        employee_id, 
        first_name, 
        last_name, 
        date_of_birth, 
        gender, 
        address, 
        phone, 
        email, 
        hire_date, 
        job_title, 
        department, 
        salary_amount, 
        hourly_rate || 0.00,
        payment_frequency, 
        is_exempt_ss || false,
        is_exempt_medical || false,
        dateOfBirthForAge
      ]
    );
    
    // Commit transaction
    await db.query('COMMIT');
    
    // Get created employee
    const [newEmployee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [result.insertId]
    );
    
    res.status(201).json(formatSuccess('Employee added successfully', newEmployee[0]));
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private/Admin
 */
exports.getEmployees = async (req, res) => {
  try {
    // Get query parameters for pagination and sorting
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC';
    
    // Build query with optional search filter
    let query = 'SELECT * FROM employees';
    let countQuery = 'SELECT COUNT(*) as total FROM employees';
    let queryParams = [];
    
    if (req.query.search) {
      const searchTerm = `%${req.query.search}%`;
      query += ' WHERE employee_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR job_title LIKE ? OR department LIKE ?';
      countQuery += ' WHERE employee_id LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR job_title LIKE ? OR department LIKE ?';
      queryParams = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
    }
    
    // Add sorting and pagination
    query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);
    
    // Execute query
    const [employees] = await db.query(query, queryParams);
    
    // Get total count for pagination
    const [countResult] = await db.query(countQuery, req.query.search ? queryParams.slice(0, 5) : []);
    const total = countResult[0].total;
    
    const response = {
      employees,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    };
    
    res.status(200).json(formatSuccess('Employees fetched successfully', response));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get single employee
 * @route   GET /api/employees/:id
 * @access  Private/Admin
 */
exports.getEmployee = async (req, res) => {
  try {
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );
    
    if (employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Get associated user if exists
    let userData = null;
    if (employee[0].user_id) {
      const [user] = await db.query(
        'SELECT id, name, email, role FROM users WHERE id = ?',
        [employee[0].user_id]
      );
      if (user.length > 0) {
        userData = user[0];
      }
    }
    
    const employeeData = {
      ...employee[0],
      user: userData
    };
    
    res.status(200).json(formatSuccess('Employee fetched successfully', employeeData));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:id
 * @access  Private/Admin
 */
exports.updateEmployee = async (req, res) => {
  const { 
    first_name, 
    last_name, 
    date_of_birth, 
    gender, 
    address, 
    phone, 
    hire_date, 
    job_title, 
    department, 
    salary_amount, 
    payment_frequency 
  } = req.body;
  
  try {
    // Check if employee exists
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );
    
    if (employee.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Calculate age for date_of_birth_for_age if date_of_birth is provided
    let dateOfBirthForAge = employee[0].date_of_birth_for_age;
    if (date_of_birth) {
      const birthDate = new Date(date_of_birth);
      const ageDifMs = Date.now() - birthDate.getTime();
      const ageDate = new Date(ageDifMs);
      dateOfBirthForAge = Math.abs(ageDate.getUTCFullYear() - 1970);
    }
    
    // Update employee
    await db.query(
      `UPDATE employees 
       SET first_name = ?, last_name = ?, date_of_birth = ?, gender = ?, 
           address = ?, phone = ?, hire_date = ?, job_title = ?, 
           department = ?, salary_amount = ?, payment_frequency = ?, 
           date_of_birth_for_age = ?
       WHERE id = ?`,
      [
        first_name, 
        last_name, 
        date_of_birth, 
        gender, 
        address, 
        phone, 
        hire_date, 
        job_title, 
        department, 
        salary_amount, 
        payment_frequency, 
        dateOfBirthForAge,
        req.params.id
      ]
    );
    
    // Get updated employee
    const [updatedEmployee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );
    
    res.status(200).json(formatSuccess('Employee updated successfully', updatedEmployee[0]));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete employee
 * @route   DELETE /api/employees/:id
 * @access  Private/Admin
 */
exports.deleteEmployee = async (req, res) => {
  try {
    // Start transaction
    await db.query('START TRANSACTION');
    
    // Check if employee exists
    const [employee] = await db.query(
      'SELECT * FROM employees WHERE id = ?',
      [req.params.id]
    );
    
    if (employee.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Delete associated user if exists
    if (employee[0].user_id) {
      await db.query('DELETE FROM users WHERE id = ?', [employee[0].user_id]);
    }
    
    // Delete employee
    await db.query('DELETE FROM employees WHERE id = ?', [req.params.id]);
    
    // Commit transaction
    await db.query('COMMIT');
    
    res.status(200).json(formatSuccess('Employee deleted successfully'));
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    res.status(500).json(formatError(error));
  }
};
