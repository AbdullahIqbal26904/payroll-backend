const jwt = require('jsonwebtoken');
const db = require('../config/db');

/**
 * Protect routes - Verify JWT token and user existence
 */
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from database
      const [rows] = await db.query(
        'SELECT id, name, email, role, mfa_enabled FROM users WHERE id = ?',
        [decoded.id]
      );
      
      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists'
        });
      }
      
      // Add user to request
      req.user = rows[0];

      // If this is not a temporary token and MFA is required but not verified
      if (decoded.isMfaVerified === false && rows[0].mfa_enabled === 1) {
        return res.status(401).json({
          success: false,
          message: 'MFA verification required',
          requireMFA: true
        });
      }
      
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

/**
 * Restrict routes based on user roles
 * @param  {...string} roles - Roles allowed to access the route
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    
    next();
  };
};

/**
 * Log user actions in audit trail
 * @param {string} entityName - The name of the entity being modified
 * @returns {Function} - Express middleware function
 */
exports.auditLogger = (entityName) => {
  return async (req, res, next) => {
    // Store the original res.json to be able to intercept it
    const originalJson = res.json;
    
    // Replace the res.json method with our custom implementation
    res.json = function(data) {
      // If this is a successful operation and we have a logged in user
      if (data.success && req.user && req.user.id) {
        // Determine the action type and entity from the request
        let action = '';
        let entity = entityName || '';
        let entityId = null;
        
        // Extract info based on HTTP method and path
        switch (req.method) {
          case 'POST':
            action = 'CREATE';
            break;
          case 'PUT':
          case 'PATCH':
            action = 'UPDATE';
            break;
          case 'DELETE':
            action = 'DELETE';
            break;
          default:
            action = 'READ';
        }
        
        // If entity is not provided, extract from path
        if (!entity) {
          const path = req.path.toLowerCase();
          if (path.includes('user')) entity = 'users';
          else if (path.includes('employee')) entity = 'employees';
          else if (path.includes('payroll')) entity = 'payrolls';
          else if (path.includes('banking')) entity = 'banking';
          else entity = 'other';
        }
        
        // Extract entity ID from request params or body
        if (req.params && req.params.id) {
          entityId = req.params.id;
        } else if (req.params && req.params.bankingId) {
          entityId = req.params.bankingId;
        } else if (data.data && data.data.id) {
          entityId = data.data.id;
        }
        
        // Log to audit trail
        try {
          db.query(
            `INSERT INTO audit_trail 
            (user_id, action, entity, entity_id, new_values, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
              req.user.id,
              action,
              entity,
              entityId,
              JSON.stringify(req.body),
              req.ip
            ]
          );
        } catch (err) {
          console.error('Error logging to audit trail:', err);
        }
      }
      
      // Call the original implementation
      return originalJson.call(this, data);
    };
    
    next();
  };
};
