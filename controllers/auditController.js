const AuditTrail = require('../models/AuditTrail');
const db = require('../config/db');

/**
 * Audit Controller
 * Handles API endpoints for retrieving audit trail records
 */
class AuditController {
  /**
   * Get audit trail records with pagination and filtering
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAuditTrail(req, res) {
    try {
      const {
        page,
        limit,
        entity,
        action,
        user_id,
        entity_id,
        start_date,
        end_date
      } = req.query;
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        entity,
        action,
        startDate: start_date,
        endDate: end_date
      };
      
      if (user_id) options.user_id = parseInt(user_id);
      if (entity_id) options.entity_id = parseInt(entity_id);
      
      const result = await AuditTrail.getAll(options);
      
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('Error getting audit trail:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving audit trail',
        error: process.env.NODE_ENV === 'production' ? {} : error
      });
    }
  }
  
  /**
   * Get audit trail records for a specific entity
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getEntityAuditTrail(req, res) {
    try {
      const { entity, entityId } = req.params;
      const { page, limit, action, start_date, end_date } = req.query;
      
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        action,
        startDate: start_date,
        endDate: end_date
      };
      
      const result = await AuditTrail.getForEntity(entity, parseInt(entityId), options);
      
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error(`Error getting audit trail for ${req.params.entity}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving entity audit trail',
        error: process.env.NODE_ENV === 'production' ? {} : error
      });
    }
  }
  
  /**
   * Get audit trail actions for analytics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAuditActions(req, res) {
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT action FROM audit_trail ORDER BY action`
      );
      
      const actions = rows.map(row => row.action);
      
      return res.status(200).json({
        success: true,
        data: actions
      });
    } catch (error) {
      console.error('Error getting audit actions:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving audit actions',
        error: process.env.NODE_ENV === 'production' ? {} : error
      });
    }
  }
  
  /**
   * Get audit trail entities for analytics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAuditEntities(req, res) {
    try {
      const [rows] = await db.query(
        `SELECT DISTINCT entity FROM audit_trail ORDER BY entity`
      );
      
      const entities = rows.map(row => row.entity);
      
      return res.status(200).json({
        success: true,
        data: entities
      });
    } catch (error) {
      console.error('Error getting audit entities:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving audit entities',
        error: process.env.NODE_ENV === 'production' ? {} : error
      });
    }
  }
  
  /**
   * Get audit trail summary
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<void>}
   */
  static async getAuditSummary(req, res) {
    try {
      // Get counts by entity
      const [entityCounts] = await db.query(
        `SELECT entity, COUNT(*) as count
        FROM audit_trail
        GROUP BY entity
        ORDER BY count DESC`
      );
      
      // Get counts by action
      const [actionCounts] = await db.query(
        `SELECT action, COUNT(*) as count
        FROM audit_trail
        GROUP BY action
        ORDER BY count DESC`
      );
      
      // Get counts by user
      const [userCounts] = await db.query(
        `SELECT 
          a.user_id, 
          u.name as user_name, 
          u.email as user_email,
          COUNT(*) as count
        FROM audit_trail a
        LEFT JOIN users u ON a.user_id = u.id
        GROUP BY a.user_id, u.name, u.email
        ORDER BY count DESC
        LIMIT 10`
      );
      
      // Get recent activity
      const [recentActivity] = await db.query(
        `SELECT 
          a.*,
          u.name as user_name,
          u.email as user_email
        FROM audit_trail a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT 10`
      );
      
      return res.status(200).json({
        success: true,
        data: {
          byEntity: entityCounts,
          byAction: actionCounts,
          byUser: userCounts,
          recentActivity
        }
      });
    } catch (error) {
      console.error('Error getting audit summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Error retrieving audit summary',
        error: process.env.NODE_ENV === 'production' ? {} : error
      });
    }
  }
}

module.exports = AuditController;