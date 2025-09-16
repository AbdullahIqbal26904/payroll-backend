const AuditService = require('../utils/auditService');

/**
 * Middleware to log API requests for auditing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.auditRequest = (req, res, next) => {
  // Store original end method to intercept response
  const originalEnd = res.end;
  
  // Capture request data
  const requestData = {
    method: req.method,
    url: req.originalUrl || req.url,
    body: req.body ? { ...req.body } : {},
    params: req.params,
    query: req.query
  };
  
  // Remove sensitive information from request
  if (requestData.body.password) {
    requestData.body.password = '[REDACTED]';
  }
  
  // Route-specific action mapping
  let entity = 'unknown';
  let action = req.method.toLowerCase();
  let entityId = null;
  
  // Extract entity type and ID from URL
  const urlParts = req.originalUrl.split('/');
  if (urlParts.length > 2) {
    const apiPrefix = urlParts.indexOf('api');
    if (apiPrefix !== -1 && apiPrefix + 1 < urlParts.length) {
      entity = urlParts[apiPrefix + 1];
      
      // Handle plural to singular for entity names
      if (entity.endsWith('s')) {
        entity = entity.slice(0, -1);
      }
      
      // Special cases
      if (entity === 'auth') entity = 'user';
      
      // Extract entityId if present
      if (apiPrefix + 2 < urlParts.length && !isNaN(urlParts[apiPrefix + 2])) {
        entityId = parseInt(urlParts[apiPrefix + 2]);
      }
    }
  }
  
  // Replace end method
  res.end = function(chunk, encoding) {
    // Restore original end method
    res.end = originalEnd;
    
    // Call original end method
    res.end(chunk, encoding);
    
    // Skip certain routes that don't need auditing
    const skipRoutes = [
      '/api/health',
      '/api/auth/verify-mfa'
    ];
    if (skipRoutes.some(route => req.originalUrl.startsWith(route))) {
      return;
    }
    
    // Only log certain methods (exclude GET by default)
    const methodsToLog = ['POST', 'PUT', 'DELETE', 'PATCH'];
    
    if (methodsToLog.includes(req.method)) {
      // Define response data
      const responseData = {
        statusCode: res.statusCode,
        success: res.statusCode >= 200 && res.statusCode < 400
      };
      
      // Map common actions based on HTTP method
      switch (req.method) {
        case 'POST':
          action = 'create';
          break;
        case 'PUT':
        case 'PATCH':
          action = 'update';
          break;
        case 'DELETE':
          action = 'delete';
          break;
      }
      
      // Special case for auth routes
      if (req.originalUrl.includes('/api/auth/login')) {
        action = 'login';
        // Only log successful logins through this middleware
        if (res.statusCode !== 200) {
          return;
        }
      } else if (req.originalUrl.includes('/api/auth/logout')) {
        action = 'logout';
      }
      
      // Log the API request to the audit trail
      AuditService.log(
        req,
        action,
        entity,
        entityId,
        { request: requestData },
        { response: responseData }
      ).catch(err => console.error('Error in audit middleware:', err));
    }
  };
  
  next();
};

/**
 * Middleware to log data changes for auditing
 * Expects oldData and newData in res.locals
 */
exports.auditDataChange = (entity) => {
  return (req, res, next) => {
    // Capture original json method to intercept response
    const originalJson = res.json;
    
    res.json = function(data) {
      // Restore original json method
      res.json = originalJson;
      
      // If successful response and we have the data to audit
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const entityId = req.params.id || (data && data.id);
        
        if (entityId) {
          const oldData = res.locals.oldData;
          const newData = res.locals.newData || data;
          
          // Determine action based on HTTP method
          let action = 'unknown';
          switch (req.method) {
            case 'POST': action = 'create'; break;
            case 'PUT':
            case 'PATCH': action = 'update'; break;
            case 'DELETE': action = 'delete'; break;
          }
          
          // Log the data change
          AuditService.log(
            req,
            action,
            entity,
            entityId,
            oldData,
            newData
          ).catch(err => console.error('Error in audit data change middleware:', err));
        }
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};