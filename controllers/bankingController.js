const db = require('../config/db');
const { formatSuccess, formatError } = require('../utils/helpers');
const { encrypt, decrypt, maskString, isValidAccountNumber, isValidRoutingNumber } = require('../utils/encryptionUtils');

/**
 * @desc    Add banking information for an employee
 * @route   POST /api/employees/:id/banking
 * @access  Private/Admin
 */
exports.addBankingInfo = async (req, res) => {
  const {
    bank_name,
    account_type,
    account_number,
    routing_number,
    is_primary,
    direct_deposit_enabled
  } = req.body;

  try {
    // Start transaction
    await db.query('START TRANSACTION');

    // Validate employee exists
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

    // Basic validation of account and routing numbers
    if (!isValidAccountNumber(account_number)) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid account number format'
      });
    }

    if (!isValidRoutingNumber(routing_number)) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Invalid routing number format'
      });
    }

    // Encrypt sensitive data
    const encryptedAccountNumber = encrypt(account_number);
    const encryptedRoutingNumber = encrypt(routing_number);

    // If this is the primary account, update all other accounts to not be primary
    if (is_primary) {
      await db.query(
        'UPDATE employee_banking_info SET is_primary = FALSE WHERE employee_id = ?',
        [req.params.id]
      );
    }

    // Insert banking information
    const [result] = await db.query(
      `INSERT INTO employee_banking_info 
      (employee_id, bank_name, account_type, account_number_encrypted, 
       routing_number_encrypted, is_primary, direct_deposit_enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        bank_name,
        account_type,
        encryptedAccountNumber,
        encryptedRoutingNumber,
        is_primary !== undefined ? is_primary : true,
        direct_deposit_enabled !== undefined ? direct_deposit_enabled : true,
        req.user.id
      ]
    );

    // Commit transaction
    await db.query('COMMIT');

    // Get the created banking info with masked account numbers for response
    const [bankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE id = ?',
      [result.insertId]
    );

    // Mask sensitive data for response
    const safeResponse = {
      ...bankingInfo[0],
      account_number_masked: maskString(account_number),
      routing_number_masked: maskString(routing_number),
      // Remove encrypted fields from response
      account_number_encrypted: undefined,
      routing_number_encrypted: undefined
    };

    res.status(201).json(formatSuccess('Banking information added successfully', safeResponse));
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get all banking information for an employee
 * @route   GET /api/employees/:id/banking
 * @access  Private/Admin
 */
exports.getBankingInfo = async (req, res) => {
  try {
    // Validate employee exists
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

    // Get banking information
    const [bankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE employee_id = ? ORDER BY is_primary DESC, created_at DESC',
      [req.params.id]
    );

    // Process each record to include masked account numbers
    const processedBankingInfo = bankingInfo.map(info => {
      try {
        // Decrypt data temporarily (only in memory)
        const accountNumber = decrypt(info.account_number_encrypted);
        const routingNumber = decrypt(info.routing_number_encrypted);
        
        // Create safe response with masked data
        return {
          id: info.id,
          employee_id: info.employee_id,
          bank_name: info.bank_name,
          account_type: info.account_type,
          account_number_masked: maskString(accountNumber),
          routing_number_masked: maskString(routingNumber),
          is_primary: !!info.is_primary,
          is_active: !!info.is_active,
          direct_deposit_enabled: !!info.direct_deposit_enabled,
          created_at: info.created_at,
          updated_at: info.updated_at
        };
      } catch (error) {
        console.error('Error processing banking record:', error);
        // Return record without decrypted data on error
        return {
          id: info.id,
          employee_id: info.employee_id,
          bank_name: info.bank_name,
          account_type: info.account_type,
          account_number_masked: 'ERROR DECRYPTING',
          routing_number_masked: 'ERROR DECRYPTING',
          is_primary: !!info.is_primary,
          is_active: !!info.is_active,
          direct_deposit_enabled: !!info.direct_deposit_enabled,
          created_at: info.created_at,
          updated_at: info.updated_at
        };
      }
    });

    res.status(200).json(formatSuccess('Banking information retrieved successfully', processedBankingInfo));
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Get a specific banking record by ID
 * @route   GET /api/employees/:id/banking/:bankingId
 * @access  Private/Admin
 */
exports.getBankingInfoById = async (req, res) => {
  try {
    // Get banking information
    const [bankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE id = ? AND employee_id = ?',
      [req.params.bankingId, req.params.id]
    );

    if (bankingInfo.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Banking information not found'
      });
    }

    // Decrypt and mask account numbers
    try {
      const accountNumber = decrypt(bankingInfo[0].account_number_encrypted);
      const routingNumber = decrypt(bankingInfo[0].routing_number_encrypted);
      
      const safeResponse = {
        ...bankingInfo[0],
        account_number_masked: maskString(accountNumber),
        routing_number_masked: maskString(routingNumber),
        // Remove encrypted fields from response
        account_number_encrypted: undefined,
        routing_number_encrypted: undefined
      };

      res.status(200).json(formatSuccess('Banking information retrieved successfully', safeResponse));
    } catch (error) {
      console.error('Error decrypting banking data:', error);
      res.status(500).json(formatError(new Error('Failed to process banking information')));
    }
  } catch (error) {
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Update banking information
 * @route   PUT /api/employees/:id/banking/:bankingId
 * @access  Private/Admin
 */
exports.updateBankingInfo = async (req, res) => {
  const {
    bank_name,
    account_type,
    account_number,
    routing_number,
    is_primary,
    is_active,
    direct_deposit_enabled
  } = req.body;

  try {
    // Start transaction
    await db.query('START TRANSACTION');

    // Check if banking record exists
    const [bankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE id = ? AND employee_id = ?',
      [req.params.bankingId, req.params.id]
    );

    if (bankingInfo.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Banking information not found'
      });
    }

    // Prepare update data
    const updateData = {};
    const params = [];

    if (bank_name) {
      updateData.bank_name = bank_name;
      params.push(bank_name);
    }

    if (account_type) {
      updateData.account_type = account_type;
      params.push(account_type);
    }

    // Encrypt account number if provided
    if (account_number) {
      if (!isValidAccountNumber(account_number)) {
        await db.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Invalid account number format'
        });
      }
      updateData.account_number_encrypted = encrypt(account_number);
      params.push(updateData.account_number_encrypted);
    }

    // Encrypt routing number if provided
    if (routing_number) {
      if (!isValidRoutingNumber(routing_number)) {
        await db.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Invalid routing number format'
        });
      }
      updateData.routing_number_encrypted = encrypt(routing_number);
      params.push(updateData.routing_number_encrypted);
    }

    // Handle boolean fields
    if (is_primary !== undefined) {
      updateData.is_primary = is_primary;
      params.push(is_primary);
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
      params.push(is_active);
    }

    if (direct_deposit_enabled !== undefined) {
      updateData.direct_deposit_enabled = direct_deposit_enabled;
      params.push(direct_deposit_enabled);
    }

    // Add updated_by
    updateData.updated_by = req.user.id;
    params.push(req.user.id);

    // Add record ID and employee ID for WHERE clause
    params.push(req.params.bankingId);
    params.push(req.params.id);

    // If no fields to update, return early
    if (Object.keys(updateData).length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // If this is being set as primary, update all other accounts to not be primary
    if (is_primary) {
      await db.query(
        'UPDATE employee_banking_info SET is_primary = FALSE WHERE employee_id = ? AND id != ?',
        [req.params.id, req.params.bankingId]
      );
    }

    // Build the SQL query
    const setClause = Object.keys(updateData)
      .map(key => `${key} = ?`)
      .join(', ');

    // Update banking information
    await db.query(
      `UPDATE employee_banking_info SET ${setClause} WHERE id = ? AND employee_id = ?`,
      params
    );

    // Commit transaction
    await db.query('COMMIT');

    // Get updated banking info
    const [updatedBankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE id = ?',
      [req.params.bankingId]
    );

    // Create safe response
    let safeResponse = { ...updatedBankingInfo[0] };
    
    // If we have the raw account/routing numbers from the request, use them to create masked versions
    if (account_number) {
      safeResponse.account_number_masked = maskString(account_number);
    } else {
      // Otherwise decrypt and mask the existing encrypted values
      try {
        const decryptedAccountNumber = decrypt(updatedBankingInfo[0].account_number_encrypted);
        safeResponse.account_number_masked = maskString(decryptedAccountNumber);
      } catch (error) {
        safeResponse.account_number_masked = 'ERROR DECRYPTING';
      }
    }

    if (routing_number) {
      safeResponse.routing_number_masked = maskString(routing_number);
    } else {
      try {
        const decryptedRoutingNumber = decrypt(updatedBankingInfo[0].routing_number_encrypted);
        safeResponse.routing_number_masked = maskString(decryptedRoutingNumber);
      } catch (error) {
        safeResponse.routing_number_masked = 'ERROR DECRYPTING';
      }
    }

    // Remove encrypted fields from response
    delete safeResponse.account_number_encrypted;
    delete safeResponse.routing_number_encrypted;

    res.status(200).json(formatSuccess('Banking information updated successfully', safeResponse));
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    res.status(500).json(formatError(error));
  }
};

/**
 * @desc    Delete banking information
 * @route   DELETE /api/employees/:id/banking/:bankingId
 * @access  Private/Admin
 */
exports.deleteBankingInfo = async (req, res) => {
  try {
    // Start transaction
    await db.query('START TRANSACTION');

    // Check if banking record exists
    const [bankingInfo] = await db.query(
      'SELECT * FROM employee_banking_info WHERE id = ? AND employee_id = ?',
      [req.params.bankingId, req.params.id]
    );

    if (bankingInfo.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Banking information not found'
      });
    }

    // Delete the banking record
    await db.query(
      'DELETE FROM employee_banking_info WHERE id = ?',
      [req.params.bankingId]
    );

    // If deleted record was primary, set another as primary if available
    if (bankingInfo[0].is_primary) {
      const [remainingAccounts] = await db.query(
        'SELECT id FROM employee_banking_info WHERE employee_id = ? ORDER BY created_at ASC LIMIT 1',
        [req.params.id]
      );

      if (remainingAccounts.length > 0) {
        await db.query(
          'UPDATE employee_banking_info SET is_primary = TRUE WHERE id = ?',
          [remainingAccounts[0].id]
        );
      }
    }

    // Commit transaction
    await db.query('COMMIT');

    res.status(200).json(formatSuccess('Banking information deleted successfully'));
  } catch (error) {
    // Rollback transaction on error
    await db.query('ROLLBACK');
    res.status(500).json(formatError(error));
  }
};
