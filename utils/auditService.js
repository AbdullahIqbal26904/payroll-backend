const AuditTrail = require('../models/AuditTrail');

/**
 * Audit Service
 * Provides utility functions for creating audit trail records
 */
class AuditService {
  /**
   * Log an audit event
   * @param {Object} req - Express request object
   * @param {string} action - The action performed (create, update, delete, login, etc.)
   * @param {string} entity - The entity affected (user, employee, payroll, etc.)
   * @param {number} entityId - ID of the affected entity
   * @param {Object} oldValues - Previous values before change (for updates)
   * @param {Object} newValues - New values after change
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async log(req, action, entity, entityId, oldValues = null, newValues = null) {
    try {
      const userId = req.user ? req.user.id : null;
      const ipAddress = req.ip || req.connection.remoteAddress;
      
      // Create audit trail entry
      return await AuditTrail.create({
        user_id: userId,
        action,
        entity,
        entity_id: entityId,
        old_values: oldValues,
        new_values: newValues,
        ip_address: ipAddress
      });
    } catch (error) {
      console.error('Error logging audit event:', error);
      // Non-blocking - we don't want audit errors to break the application
      return null;
    }
  }
  
  /**
   * Log a creation event
   * @param {Object} req - Express request object
   * @param {string} entity - The entity created (user, employee, etc.)
   * @param {number} entityId - ID of the created entity
   * @param {Object} data - The data used to create the entity
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logCreation(req, entity, entityId, data) {
    return this.log(req, 'create', entity, entityId, null, data);
  }
  
  /**
   * Log an update event
   * @param {Object} req - Express request object
   * @param {string} entity - The entity updated (user, employee, etc.)
   * @param {number} entityId - ID of the updated entity
   * @param {Object} oldData - The entity data before the update
   * @param {Object} newData - The entity data after the update
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logUpdate(req, entity, entityId, oldData, newData) {
    return this.log(req, 'update', entity, entityId, oldData, newData);
  }
  
  /**
   * Log a deletion event
   * @param {Object} req - Express request object
   * @param {string} entity - The entity deleted (user, employee, etc.)
   * @param {number} entityId - ID of the deleted entity
   * @param {Object} data - The data of the deleted entity
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logDeletion(req, entity, entityId, data) {
    return this.log(req, 'delete', entity, entityId, data, null);
  }
  
  /**
   * Log a login event
   * @param {Object} req - Express request object
   * @param {Object} userData - The user data
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logLogin(req, userData) {
    // Remove sensitive data
    const sanitizedUserData = { ...userData };
    delete sanitizedUserData.password;
    
    return this.log(
      req,
      'login',
      'user',
      userData.id,
      null,
      { message: 'User logged in successfully' }
    );
  }
  
  /**
   * Log a logout event
   * @param {Object} req - Express request object
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logLogout(req) {
    return this.log(
      req,
      'logout',
      'user',
      req.user.id,
      null,
      { message: 'User logged out' }
    );
  }
  
  /**
   * Log a failed login attempt
   * @param {Object} req - Express request object
   * @param {string} email - Email used in the failed login attempt
   * @param {string} reason - Reason for login failure
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async logFailedLogin(req, email, reason) {
    return this.log(
      req,
      'failed_login',
      'user',
      null,
      null,
      { email, reason }
    );
  }
}

module.exports = AuditService;