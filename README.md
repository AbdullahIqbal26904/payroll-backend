# MSA Payroll System Backend API

This is the backend API for MSA Payroll System developed specifically for Antigua. It handles authentication, employee management, timesheet processing, and payroll calculations.

## Phase 2 Update

Phase 2 has been implemented with the following features:
- Punch report CSV import in the Attend Time Clock format
- Antigua-specific payroll calculations:
  - Social Security (7% employee, 9% employer, capped at $6,500 insurable earnings)
  - Medical Benefits (3.5% standard rate, reduced rates for seniors)
  - Education Levy (tiered rates based on salary thresholds)
- PDF paystub generation
- Email delivery of paystubs to employees:
  - Bulk email delivery for entire payroll run
  - Individual email delivery for specific employees
  - PDF paystubs attached to emails

## Latest Updates

- Added secure ACH Banking Information Management:
  - Secure storage of employee banking details with AES-256-CBC encryption
  - Support for multiple bank accounts per employee with primary account designation
  - Comprehensive API for managing banking information
  - Data masking for sensitive information in API responses
  - Role-based access control for banking data

- Added management-focused deductions report for analyzing employee contributions:
  - Detailed breakdown of social security, medical benefits, and education levy contributions
  - Filter by all employees, date range, or department
  - Export in CSV format for further analysis
  - View totals for gross pay, net pay, and all deduction types

- Added support for Private Duty Nurse employee type:
  - Shift-based pay rates
  - Day shift (7am-7pm) Monday-Friday: $35/hour
  - Night shift (7pm-7am) all days: $40/hour
  - Day shift (7am-7pm) Saturday-Sunday: $40/hour
  - No overtime eligibility

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5001
   DB_HOST=localhost
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=payroll_system
   JWT_SECRET=your_jwt_secret
   JWT_EXPIRE=7d
   ENCRYPTION_KEY=32charactersecretkeyrequiredhere
   EMAIL_HOST=smtp.example.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@example.com
   EMAIL_PASSWORD=your_email_password
   EMAIL_SECURE=false
   ```
4. Run the database migrations: `./migrate.sh`
5. Start the server:
   - Development mode: `npm run dev`
   - Production mode: `npm start`

## API Documentation

A Postman collection is included at the root of the project (`Payroll_System_API.postman_collection.json`). You can import this into Postman to test all the API endpoints.

### Setup Postman
1. Import the collection file into Postman
2. Set up the `baseUrl` variable to your server URL (e.g., `http://localhost:5001`)
3. Login using the admin credentials and save the returned token to the `token` variable

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email and password |
| GET | `/api/auth/me` | Get current logged in user |
| PUT | `/api/auth/change-password` | Change user's password |

### User Management (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | Get all users |
| POST | `/api/users` | Create a new user |
| GET | `/api/users/:id` | Get a single user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |
| POST | `/api/users/:id/reset-password` | Reset user's password |

### Employee Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | Get all employees |
| POST | `/api/employees` | Create a new employee |
| GET | `/api/employees/:id` | Get a single employee |
| PUT | `/api/employees/:id` | Update employee |
| DELETE | `/api/employees/:id` | Delete employee |

### Timesheet Management (Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payroll/upload-timesheet` | Upload and process timesheet CSV |
| GET | `/api/payroll/timesheet-periods` | Get all timesheet periods |
| GET | `/api/payroll/timesheet-periods/:id` | Get timesheet period details |

### Payroll Management (Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payroll/calculate` | Calculate payroll for a period |
| GET | `/api/payroll/reports` | Get all payroll reports |
| GET | `/api/payroll/reports/:id` | Get payroll report details |
| GET | `/api/payroll/paystub/:payrollRunId/:employeeId` | Download employee paystub PDF |
| POST | `/api/payroll/email-paystubs` | Email paystubs to employees (bulk or selected) |
| POST | `/api/payroll/email-paystub/:payrollRunId/:employeeId` | Email paystub to a specific employee |
| GET | `/api/payroll/settings` | Get payroll settings |
| PUT | `/api/payroll/settings` | Update payroll settings |
| GET | `/api/payroll/deductions-report` | Get management-focused deductions report |

<!-- Employee Loan Management section removed -->

### Employee Management (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | Get all employees |
| POST | `/api/employees` | Add a new employee |
| GET | `/api/employees/:id` | Get a single employee |
| PUT | `/api/employees/:id` | Update employee |
| DELETE | `/api/employees/:id` | Delete employee |

### Banking Information Management (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees/:id/banking` | Get all banking records for an employee |
| POST | `/api/employees/:id/banking` | Add banking information for an employee |
| GET | `/api/employees/:id/banking/:bankingId` | Get a specific banking record |
| PUT | `/api/employees/:id/banking/:bankingId` | Update banking information |
| DELETE | `/api/employees/:id/banking/:bankingId` | Delete banking information |

## Phase 1 Features

- User authentication with JWT
- Role-based authorization (admin, employee)
- User management for admins
- Employee management
- Audit logging

## Phase 2 Features (Coming Soon)

- CSV import for timesheets
- Payroll processing with the following calculations:
  - Social Security (7% from employee, 9% from employer, max $6,500)
  - Medical Benefits (3.5% from employee, 3.5% from employer)
  - Education Levy (2.5% on income < $5,000, 5% on income > $5,000)
  - Special rates for employees of pensionable age
- Payroll reports
- Email notifications for paystubs
- Tax and benefit calculations according to Antigua regulations

### Payroll Calculation Rules

The system will implement the following rules for payroll calculations:

**Social Security**
- 16% of employee's gross salary is paid to Social Security monthly
- 7% is deducted from the employee's gross salary
- 9% is paid by the employer
- The maximum monthly insurable earning is $6,500.00
- Employees at pensionable age (65 in 2025) are exempt from contributions

**Medical Benefits**
- 7% of employee's gross salary is paid to Medical Benefits monthly
- 3.5% is deducted from the employee's gross salary
- 3.5% is paid by the employer
- Employees over 60 but not yet 70: 2.5% is deducted from employee, 0% from employer
- Employees over 70 are not required to remit medical benefits contributions

**Education Levy**
- Employee salaries below $5,000.00 per month:
  - (Monthly gross income - $541.67) multiplied by 2.5%
- Employee salaries above $5,000.00 per month:
  - The first $5,000 is taxed as above
  - Any amount over $5,000.00 is taxed at 5%
  - Both amounts are added together
