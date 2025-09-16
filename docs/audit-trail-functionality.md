# Audit Trail Functionality Documentation

## Overview
The Audit Trail feature is implemented to track all significant changes made to the system for security, compliance, and accountability purposes. It records who made what changes, when, and from where.

## Database Structure
The audit trail data is stored in the `audit_trail` table with the following structure:
- `id` - Auto-incremented primary key
- `user_id` - The ID of the user who made the change (nullable)
- `action` - The action performed (create, update, delete, login, etc.)
- `entity` - The entity affected (user, employee, payroll, etc.)
- `entity_id` - ID of the affected entity (optional)
- `old_values` - Previous values before change (for updates), stored as JSON
- `new_values` - New values after change, stored as JSON
- `ip_address` - IP address of the user
- `created_at` - Timestamp of when the audit record was created

## Components

### 1. Audit Model (models/AuditTrail.js)
Handles database operations for the audit trail table.

**Main methods:**
- `create(data)` - Create a new audit trail record
- `getAll(options)` - Get audit trail records with pagination and filtering
- `getForEntity(entity, entityId, options)` - Get audit trail for a specific entity

### 2. Audit Service (utils/auditService.js)
Provides utility functions for creating audit trail records.

**Main methods:**
- `log(req, action, entity, entityId, oldValues, newValues)` - Generic method to log any audit event
- `logCreation(req, entity, entityId, data)` - Log a creation event
- `logUpdate(req, entity, entityId, oldData, newData)` - Log an update event
- `logDeletion(req, entity, entityId, data)` - Log a deletion event
- `logLogin(req, userData)` - Log a login event
- `logLogout(req)` - Log a logout event
- `logFailedLogin(req, email, reason)` - Log a failed login attempt

### 3. Audit Middleware (middlewares/audit.js)
Middleware to automatically log API requests and data changes.

**Main components:**
- `auditRequest` - Middleware to automatically log API requests
- `auditDataChange(entity)` - Middleware to log data changes for a specific entity

### 4. Audit Controller (controllers/auditController.js)
Handles API endpoints for retrieving audit trail records.

**Available endpoints:**
- `GET /api/audit` - Get audit trail records with pagination and filtering
- `GET /api/audit/summary` - Get audit trail summary for dashboard
- `GET /api/audit/actions` - Get distinct audit actions for filters
- `GET /api/audit/entities` - Get distinct audit entities for filters
- `GET /api/audit/entity/:entity/:entityId` - Get audit trail for a specific entity

### 5. Audit Routes (routes/auditRoutes.js)
Defines the API routes for accessing audit trail functionality.

## How to Use

### 1. Automatic API Request Logging
The `auditRequest` middleware is registered globally in `app.js`, so all API requests (POST, PUT, DELETE, PATCH) will be automatically logged. No additional code is required.

### 2. Manual Logging
For more detailed logging or custom events, use the `AuditService` methods:

```javascript
const AuditService = require('../utils/auditService');

// Log a creation event
await AuditService.logCreation(req, 'employee', employeeId, newEmployeeData);

// Log an update event
await AuditService.logUpdate(req, 'payroll', payrollId, oldPayrollData, newPayrollData);

// Log a deletion event
await AuditService.logDeletion(req, 'vacation', vacationId, vacationData);
```

### 3. Data Change Logging
To log detailed changes to data, use the `auditDataChange` middleware in your routes:

```javascript
const { auditDataChange } = require('../middlewares/audit');

// In your route file
router.put('/:id', auditDataChange('employee'), employeeController.updateEmployee);
```

The middleware expects `oldData` to be set in `res.locals` before the controller is called. For example:

```javascript
// In your controller
async function updateEmployee(req, res, next) {
  try {
    // Get old data first
    const [oldEmployee] = await db.query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    
    // Store old data for audit
    res.locals.oldData = oldEmployee[0];
    
    // Proceed with update
    // ...
    
    // New data will be captured from the response automatically
    return res.status(200).json({ success: true, data: updatedEmployee });
  } catch (error) {
    next(error);
  }
}
```

### 4. Accessing Audit Records
Only users with the `admin` role can access audit records through the API endpoints:

- Get all audit records with filtering:
  ```
  GET /api/audit?page=1&limit=50&entity=employee&action=update
  ```

- Get audit summary for dashboard:
  ```
  GET /api/audit/summary
  ```

- Get audit trail for a specific entity:
  ```
  GET /api/audit/entity/employee/123
  ```

## Security Considerations

1. **Access Control**: Only admin users can access audit records
2. **Data Sensitivity**: Passwords and sensitive data are automatically redacted in audit logs
3. **Performance**: The audit service is designed to fail gracefully and not block main operations
4. **Storage**: Large JSON objects are stored efficiently in the database

## Best Practices

1. Use the `auditDataChange` middleware for detailed entity changes
2. Use manual logging for complex business operations or critical security events
3. Consider implementing data retention policies for audit logs
4. Audit logs should be treated as immutable - never modify existing records