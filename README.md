# Payroll System Backend API

This is the backend API for MSA Payroll System developed specifically for Antiqua. It handles authentication, employee management, and payroll processing.

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
   ```
4. Start the server:
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

### Employee Management (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/employees` | Get all employees |
| POST | `/api/employees` | Add a new employee |
| GET | `/api/employees/:id` | Get a single employee |
| PUT | `/api/employees/:id` | Update employee |
| DELETE | `/api/employees/:id` | Delete employee |

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
