# ACH Banking Information Implementation

This document outlines the implementation of secure banking information management for employee ACH payments in the payroll system.

## Overview

The system securely stores and manages employee banking information for ACH (Automated Clearing House) transfers. This implementation follows financial data security best practices and employs encryption for sensitive banking data.

## Database Structure

### Employee Banking Information Table

```sql
CREATE TABLE employee_banking_info (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id VARCHAR(20) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  account_type ENUM('Checking', 'Savings') NOT NULL DEFAULT 'Checking',
  account_number_encrypted TEXT NOT NULL,
  routing_number_encrypted TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  direct_deposit_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT,
  updated_by INT,
  
  -- Foreign keys
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  
  -- Indexes
  INDEX idx_employee_id (employee_id),
  INDEX idx_is_primary (is_primary),
  INDEX idx_is_active (is_active)
)
```

## Security Implementation

### Encryption

- **Encryption Algorithm**: AES-256-CBC (Advanced Encryption Standard with 256-bit key in Cipher Block Chaining mode)
- **Encryption Key**: 32-character key stored in environment variables (ENCRYPTION_KEY)
- **Initialization Vector (IV)**: Unique random IV generated for each encryption operation
- **Storage Format**: `iv:encryptedData` (both Base64 encoded)

### Data Protection

- Account numbers and routing numbers are encrypted before storage
- Decryption only occurs when necessary and data remains in memory briefly
- API responses include masked versions of sensitive data (e.g., ****1234)
- Full account/routing numbers are never returned in API responses

## API Endpoints

### 1. Add Banking Information

- **Endpoint**: `POST /api/employees/:id/banking`
- **Access**: Private/Admin
- **Description**: Add banking information for an employee
- **Request Body**:
  ```json
  {
    "bank_name": "Example Bank",
    "account_type": "Checking",
    "account_number": "1234567890",
    "routing_number": "123456789",
    "is_primary": true,
    "direct_deposit_enabled": true
  }
  ```

### 2. Get All Banking Information for Employee

- **Endpoint**: `GET /api/employees/:id/banking`
- **Access**: Private/Admin
- **Description**: Retrieve all banking records for an employee
- **Response**: List of banking records with masked account/routing numbers

### 3. Get Specific Banking Record

- **Endpoint**: `GET /api/employees/:id/banking/:bankingId`
- **Access**: Private/Admin
- **Description**: Retrieve a specific banking record
- **Response**: Banking record with masked account/routing numbers

### 4. Update Banking Information

- **Endpoint**: `PUT /api/employees/:id/banking/:bankingId`
- **Access**: Private/Admin
- **Description**: Update banking information
- **Request Body**: Any of the fields from the add endpoint (all optional)

### 5. Delete Banking Information

- **Endpoint**: `DELETE /api/employees/:id/banking/:bankingId`
- **Access**: Private/Admin
- **Description**: Delete banking record

## Security Considerations

1. **HTTPS Transport**: All API requests should use HTTPS to secure data in transit

2. **Role-Based Access Control**: Only administrators have access to banking information

3. **Data Masking**: Account and routing numbers are masked in all responses

4. **Validation**: Account and routing numbers are validated for proper format

5. **Audit Logging**: Changes to banking information are logged in the audit trail

6. **Primary Account Management**: System ensures only one account per employee is marked as primary

7. **Encryption Key Security**: Key is stored as an environment variable, not in code

## Environment Variables

```
# Required for encryption
ENCRYPTION_KEY=32charactersecretkeyrequiredhere
```

## Usage in Code

### Encrypting Data

```javascript
const { encrypt } = require('../utils/encryptionUtils');
const encryptedAccountNumber = encrypt(accountNumber);
```

### Decrypting Data

```javascript
const { decrypt } = require('../utils/encryptionUtils');
const accountNumber = decrypt(encryptedAccountNumber);
```

### Masking Data

```javascript
const { maskString } = require('../utils/encryptionUtils');
const maskedAccountNumber = maskString(accountNumber); // Returns ****1234
```

## Future Enhancements

1. **ACH Report Generation**: To be implemented in future phases
2. **Batch Payment Processing**: Integration with ACH processing systems
3. **Multi-Account Percentage Distributions**: Allow splitting direct deposits between accounts
4. **Enhanced Validation**: Additional validation for bank-specific routing numbers
