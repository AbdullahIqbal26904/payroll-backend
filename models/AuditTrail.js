const db = require('../config/db');

/**
 * AuditTrail Model
 * Handles database operations for the audit_trail table
 */
class AuditTrail {
  /**
   * Create a new audit trail record
   * @param {Object} data - Audit data
   * @param {number} data.user_id - User ID who performed the action (can be null)
   * @param {string} data.action - The action performed (create, update, delete, login, etc.)
   * @param {string} data.entity - The entity affected (user, employee, payroll, etc.)
   * @param {number} data.entity_id - ID of the affected entity (optional)
   * @param {Object} data.old_values - Previous values before change (for updates)
   * @param {Object} data.new_values - New values after change
   * @param {string} data.ip_address - IP address of the user
   * @returns {Promise<number>} - ID of the created audit record
   */
  static async create(data) {
    try {
      const { user_id, action, entity, entity_id, old_values, new_values, ip_address } = data;
      
      // Convert objects to JSON strings
      const oldValuesJson = old_values ? JSON.stringify(old_values) : null;
      const newValuesJson = new_values ? JSON.stringify(new_values) : null;
      
      const [result] = await db.query(
        `INSERT INTO audit_trail 
        (user_id, action, entity, entity_id, old_values, new_values, ip_address) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [user_id, action, entity, entity_id, oldValuesJson, newValuesJson, ip_address]
      );
      
      return result.insertId;
    } catch (error) {
      console.error('Error creating audit trail:', error);
      throw error;
    }
  }
  
  /**
   * Get audit trail records with pagination and filtering
   * @param {Object} options - Query options
   * @param {number} options.page - Page number (default: 1)
   * @param {number} options.limit - Number of records per page (default: 50)
   * @param {string} options.entity - Filter by entity type
   * @param {string} options.action - Filter by action type
   * @param {number} options.user_id - Filter by user ID
   * @param {string} options.startDate - Filter by start date
   * @param {string} options.endDate - Filter by end date
   * @returns {Promise<Object>} - Audit records and pagination info
   */
  static async getAll(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        entity,
        action,
        user_id,
        startDate,
        endDate,
        entity_id
      } = options;
      
      const offset = (page - 1) * limit;
      
      // Build WHERE clause for filtering
      let whereClause = '';
      const params = [];
      const conditions = [];
      
      if (entity) {
        conditions.push('entity = ?');
        params.push(entity);
      }
      
      if (action) {
        conditions.push('action = ?');
        params.push(action);
      }
      
      if (user_id) {
        conditions.push('user_id = ?');
        params.push(user_id);
      }
      
      if (entity_id) {
        conditions.push('entity_id = ?');
        params.push(entity_id);
      }
      
      if (startDate) {
        conditions.push('created_at >= ?');
        params.push(new Date(startDate));
      }
      
      if (endDate) {
        conditions.push('created_at <= ?');
        params.push(new Date(endDate));
      }
      
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
      
      // Execute main query with pagination
      const [rows] = await db.query(
        `SELECT 
          a.*,
          u.name as user_name,
          u.email as user_email
        FROM audit_trail a
        LEFT JOIN users u ON a.user_id = u.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      
      // Get total count for pagination
      const [countResult] = await db.query(
        `SELECT COUNT(*) as total FROM audit_trail ${whereClause}`,
        params
      );
      
      const total = countResult[0].total;
      
      return {
        data: rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error getting audit trail:', error);
      throw error;
    }
  }
  
  /**
   * Get audit trail for a specific entity
   * @param {string} entity - Entity type (user, employee, etc.)
   * @param {number} entityId - ID of the entity
   * @param {Object} options - Query options
   * @returns {Promise<Object>} - Audit records for the entity
   */
  static async getForEntity(entity, entityId, options = {}) {
    try {
      return this.getAll({
        ...options,
        entity,
        entity_id: entityId
      });
    } catch (error) {
      console.error(`Error getting audit trail for ${entity} ${entityId}:`, error);
      throw error;
    }
  }
}

module.exports = AuditTrail;