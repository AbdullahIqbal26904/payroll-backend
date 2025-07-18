# MSA Payroll System - Phase 2 API Documentation

## Overview

This document outlines the API endpoints for Phase 2 of the MSA Payroll System for Antigua. In this phase, we've implemented:

1. CSV timesheet import with the specific format from Attend Time Clock
2. Payroll calculation based on Antigua's rules for:
   - Social Security (7% employee, 9% employer, max $6,500 insurable earnings)
   - Medical Benefits (3.5% employee, 3.5% employer; reduced rates for seniors)
   - Education Levy (tiered rates based on salary threshold)
3. PDF paystub generation
4. Email delivery of paystubs to employees
5. Employee loan management with payroll deductions
6. Year-To-Date (YTD) tracking for all earnings and deductions
7. Vacation entitlement management with accrual tracking

## Authentication

All API endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## Base URL

```
http://localhost:5001/api
```

## Endpoints

### Employee Loan Management

#### Get All Loans

Retrieve a list of all employee loans with pagination and optional filtering.

- **URL:** `/loans`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **Query Parameters:**

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 10) |
| employeeId | String | Filter loans by employee ID (optional) |
| status | String | Filter loans by status (e.g., 'active', 'paid', 'defaulted') (optional) |

**Success Response:**
```json
{
  "success": true,
  "message": "Employee loans retrieved successfully",
  "data": {
    "loans": [
      {
        "id": 1,
        "employee_id": "EMP001",
        "employee_name": "John Doe",
        "loan_amount": 5000.00,
        "interest_rate": 5.5,
        "total_payable": 5275.00,
        "installment_amount": 220.00,
        "remaining_balance": 3935.00,
        "start_date": "2025-05-01",
        "expected_end_date": "2025-11-15",
        "status": "active",
        "created_at": "2025-04-25T10:30:00.000Z"
      }
    ],
    "totalCount": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

#### Get Loan by ID

Retrieve details of a specific employee loan by its ID.

- **URL:** `/loans/:id`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| id | ID of the loan to retrieve |

**Success Response:**
```json
{
  "success": true,
  "message": "Loan retrieved successfully",
  "data": {
    "id": 1,
    "employee_id": 5,
    "employee_name": "John Doe",
    "loan_amount": 5000.00,
    "interest_rate": 5.5,
    "total_payable": 5275.00,
    "installment_amount": 220.00,
    "remaining_balance": 3935.00,
    "start_date": "2025-05-01",
    "expected_end_date": "2025-11-15",
    "status": "active",
    "created_at": "2025-04-25T10:30:00.000Z",
    "payments": [
      {
        "id": 1,
        "loan_id": 1,
        "payroll_item_id": 42,
        "payment_date": "2025-05-15",
        "payment_amount": 220.00,
        "principal_amount": 192.50,
        "interest_amount": 27.50,
        "remaining_balance": 4780.00,
        "created_at": "2025-05-15T16:30:00.000Z"
      },
      {
        "id": 2,
        "loan_id": 1,
        "payroll_item_id": 65,
        "payment_date": "2025-05-31",
        "payment_amount": 220.00,
        "principal_amount": 195.00,
        "interest_amount": 25.00,
        "remaining_balance": 4585.00,
        "created_at": "2025-05-31T16:30:00.000Z"
      }
    ]
  }
}
```

#### Create Employee Loan

Create a new employee loan record.

- **URL:** `/loans`
- **Method:** `POST`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "employee_id": "EMP001",
  "loan_amount": 5000.00,
  "interest_rate": 5.5,
  "installment_amount": 220.00,
  "start_date": "2025-05-01",
  "expected_end_date": "2025-11-15",
  "notes": "Education loan for employee's MBA program"
}
```

**Required Fields:**
- `employee_id` - ID of the employee receiving the loan (matches the `id` field in employees table)
- `loan_amount` - Principal amount of the loan
- `interest_rate` - Annual interest rate (percentage)
- `installment_amount` - Amount to be deducted per pay period
- `start_date` - Date when loan becomes effective

**Optional Fields:**
- `expected_end_date` - Expected loan completion date (calculated automatically if not provided)
- `notes` - Additional information about the loan

**Success Response:**
```json
{
  "success": true,
  "message": "Employee loan created successfully",
  "data": {
    "id": 1,
    "employee_id": "EMP001",
    "loan_amount": 5000.00,
    "interest_rate": 5.5,
    "total_payable": 5275.00,
    "installment_amount": 220.00,
    "remaining_balance": 5000.00,
    "start_date": "2025-05-01",
    "expected_end_date": "2025-11-15",
    "status": "active",
    "notes": "Education loan for employee's MBA program",
    "created_at": "2025-04-25T10:30:00.000Z"
  }
}
```

#### Update Employee Loan

Update an existing employee loan record.

- **URL:** `/loans/:id`
- **Method:** `PUT`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `application/json`
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| id | ID of the loan to update |

**Request Body:**
```json
{
  "installment_amount": 250.00,
  "status": "paused",
  "notes": "Temporarily paused due to employee request"
}
```

**Updatable Fields:**
- `installment_amount` - Amount to be deducted per pay period
- `status` - Loan status ('active', 'paused', 'paid', 'defaulted', 'cancelled')
- `notes` - Additional information about the loan

**Note:** Certain fields like loan_amount, interest_rate, and employee_id cannot be modified after loan creation

**Success Response:**
```json
{
  "success": true,
  "message": "Employee loan updated successfully",
  "data": {
    "id": 1,
    "employee_id": 5,
    "loan_amount": 5000.00,
    "interest_rate": 5.5,
    "total_payable": 5275.00,
    "installment_amount": 250.00,
    "remaining_balance": 3935.00,
    "start_date": "2025-05-01",
    "expected_end_date": "2025-11-15",
    "status": "paused",
    "notes": "Temporarily paused due to employee request",
    "updated_at": "2025-06-10T14:15:00.000Z"
  }
}
```

#### Get Loans for Specific Employee

Retrieve all loans associated with a specific employee.

- **URL:** `/employees/:id/loans`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| id | ID of the employee |

**Query Parameters:**

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 10) |
| status | String | Filter loans by status (e.g., 'active', 'paid', 'defaulted') (optional) |

**Success Response:**
```json
{
  "success": true,
  "message": "Employee loans retrieved successfully",
  "data": {
    "loans": [
      {
        "id": 1,
        "employee_id": "EMP001",
        "employee_name": "John Doe",
        "loan_amount": 5000.00,
        "interest_rate": 5.5,
        "total_payable": 5275.00,
        "installment_amount": 250.00,
        "remaining_balance": 3935.00,
        "start_date": "2025-05-01",
        "expected_end_date": "2025-11-15",
        "status": "active",
        "created_at": "2025-04-25T10:30:00.000Z"
      },
      {
        "id": 3,
        "employee_id": "EMP001",
        "employee_name": "John Doe",
        "loan_amount": 1000.00,
        "interest_rate": 3.0,
        "total_payable": 1030.00,
        "installment_amount": 100.00,
        "remaining_balance": 0.00,
        "start_date": "2025-01-15",
        "expected_end_date": "2025-03-31",
        "status": "paid",
        "created_at": "2025-01-10T09:45:00.000Z"
      }
    ],
    "totalCount": 2,
    "page": 1,
    "totalPages": 1
  }
}
```

### Upload Timesheet CSV

Upload and process a timesheet CSV file in the Attend Time Clock format.

- **URL:** `/payroll/upload-timesheet`
- **Method:** `POST`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `multipart/form-data`

**Request Body:**
| Parameter | Type | Description |
| --------- | ---- | ----------- |
| file | File | CSV file in the specified format |

**Expected CSV Format:**
```
Punch_Report - Advanced Gastroenterology
06/02/2025-06/15/2025
EMP L NAME  EMP F NAME  EMP##   DATE    IN      OUT     TOTAL   DEPT CODE   IN LOCATION     IN PUNCH METHOD   OUT LOCATION    OUT PUNCH METHOD
Garcia      Yajaira              06/02/2025      7:25 AM 7:16 PM 11:51   OFC     70.143.116.217   Manual Edit     70.143.116.217   Manual Edit
...
```

**Success Response:**
```json
{
  "success": true,
  "message": "Timesheet data uploaded and processed successfully",
  "data": {
    "periodId": 1,
    "reportTitle": "Punch Report - Advanced Gastroenterology",
    "periodStart": "2025-06-02",
    "periodEnd": "2025-06-15",
    "totalEntries": 27,
    "errors": null
  }
}
```

### Get Timesheet Periods

Retrieve a list of all timesheet periods.

- **URL:** `/payroll/timesheet-periods`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **Query Parameters:**

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 10) |

**Success Response:**
```json
{
  "success": true,
  "message": "Timesheet periods retrieved successfully",
  "data": {
    "periods": [
      {
        "id": 1,
        "report_title": "Punch Report - Advanced Gastroenterology",
        "period_start": "2025-06-02",
        "period_end": "2025-06-15",
        "created_at": "2023-10-15T14:30:00.000Z",
        "employee_count": 3,
        "entries_count": 27
      }
    ],
    "totalCount": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

### Get Timesheet Period Details

Retrieve details of a specific timesheet period including all entries.

- **URL:** `/payroll/timesheet-periods/:id`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| id | ID of the timesheet period |

**Success Response:**
```json
{
  "success": true,
  "message": "Timesheet period retrieved successfully",
  "data": {
    "period": {
      "id": 1,
      "report_title": "Punch Report - Advanced Gastroenterology",
      "period_start": "2025-06-02",
      "period_end": "2025-06-15",
      "created_at": "2023-10-15T14:30:00.000Z"
    },
    "entries": [
      {
        "id": 1,
        "last_name": "Garcia",
        "first_name": "Yajaira",
        "work_date": "2025-06-02",
        "time_in": "7:25 AM",
        "time_out": "7:16 PM",
        "total_hours": "11:51",
        "hours_decimal": 11.85,
        "dept_code": "OFC",
        "in_location": "70.143.116.217",
        "in_punch_method": "Manual Edit",
        "out_location": "70.143.116.217",
        "out_punch_method": "Manual Edit"
      }
    ]
  }
}
```

### Calculate Payroll

Calculate payroll for a specific timesheet period.

- **URL:** `/payroll/calculate`
- **Method:** `POST`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "periodId": 1,
  "payDate": "2025-06-15",
  "paymentFrequency": "Bi-Weekly"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Payroll calculated successfully",
  "data": {
    "payrollRunId": 1,
    "periodId": 1,
    "payDate": "2025-06-15",
    "totalEmployees": 3,
    "payrollItems": [
      {
        "id": 1,
        "employeeId": 1,
        "employeeName": "Yajaira Garcia",
        "hoursWorked": 51.45,
        "grossPay": 1543.50,
        "socialSecurityEmployee": 108.05,
        "socialSecurityEmployer": 138.92,
        "medicalBenefitsEmployee": 54.02,
        "medicalBenefitsEmployer": 54.02,
        "educationLevy": 25.05,
        "totalDeductions": 187.12,
        "netPay": 1356.38
      }
    ],
    "errors": null
  }
}
```

### Get Payroll Reports

Retrieve a list of all payroll calculation runs.

- **URL:** `/payroll/reports`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **Query Parameters:**

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 10) |

**Success Response:**
```json
{
  "success": true,
  "message": "Payroll reports retrieved successfully",
  "data": {
    "reports": [
      {
        "id": 1,
        "period_id": 1,
        "report_title": "Punch Report - Advanced Gastroenterology",
        "period_start": "2025-06-02",
        "period_end": "2025-06-15",
        "pay_date": "2025-06-15",
        "status": "completed",
        "total_employees": 3,
        "total_gross": 4250.75,
        "total_net": 3725.45,
        "created_at": "2023-10-15T15:30:00.000Z",
        "created_by_name": "System Admin"
      }
    ],
    "totalCount": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

### Get Payroll Report Details

Retrieve details of a specific payroll run including all employee items.

- **URL:** `/payroll/reports/:id`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| id | ID of the payroll run |

**Success Response:**
```json
{
  "success": true,
  "message": "Payroll report retrieved successfully",
  "data": {
    "id": 1,
    "period_id": 1,
    "report_title": "Punch Report - Advanced Gastroenterology",
    "period_start": "2025-06-02",
    "period_end": "2025-06-15",
    "pay_date": "2025-06-15",
    "status": "completed",
    "total_employees": 3,
    "total_gross": 4250.75,
    "total_net": 3725.45,
    "created_at": "2023-10-15T15:30:00.000Z",
    "created_by_name": "System Admin",
    "items": [
      {
        "id": 1,
        "payroll_run_id": 1,
        "employee_id": "EMP001",
        "employee_name": "Yajaira Garcia",
        "hours_worked": 51.45,
        "gross_pay": 1543.50,
        "social_security_employee": 108.05,
        "social_security_employer": 138.92,
        "medical_benefits_employee": 54.02,
        "medical_benefits_employer": 54.02,
        "education_levy": 25.05,
        "net_pay": 1356.38,
        "created_at": "2023-10-15T15:30:00.000Z"
      }
    ]
  }
}
```

### Download Paystub PDF

Generate and download a PDF paystub for a specific employee.

- **URL:** `/payroll/paystub/:payrollRunId/:employeeId`
- **Method:** `GET`
- **Auth required:** Yes
- **URL Parameters:**

| Parameter | Description |
| --------- | ----------- |
| payrollRunId | ID of the payroll run |
| employeeId | ID of the employee (matches the `id` field in employees table) |

**Success Response:**
- Content-Type: application/pdf
- Content-Disposition: attachment; filename=paystub-Employee-Name-1.pdf
- Body: PDF binary data

### Email Paystubs to Employees

Send paystubs via email to selected employees or all employees in a payroll run.

- **URL:** `/payroll/email-paystubs`
- **Method:** `POST`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "payrollRunId": 1,
  "sendToAll": true,
  "employeeIds": [] // Array of employee IDs (matches the id field in employees table)
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Paystubs emailed to employees",
  "data": {
    "totalSent": 3,
    "totalFailed": 0,
    "results": [
      {
        "employeeId": "EMP001",
        "employeeName": "Yajaira Garcia",
        "email": "yajaira.garcia@example.com",
        "messageId": "<abc123@example.com>",
        "status": "sent"
      }
    ]
  }
}
```

### Get Payroll Settings

Retrieve current payroll settings for Antigua.

- **URL:** `/payroll/settings`
- **Method:** `GET`
- **Auth required:** Yes (Admin only)

**Success Response:**
```json
{
  "success": true,
  "message": "Payroll settings retrieved successfully",
  "data": {
    "id": 1,
    "social_security_employee_rate": 7.00,
    "social_security_employer_rate": 9.00,
    "social_security_max_insurable": 6500.00,
    "medical_benefits_employee_rate": 3.50,
    "medical_benefits_employer_rate": 3.50,
    "medical_benefits_employee_senior_rate": 2.50,
    "education_levy_rate": 2.50,
    "education_levy_high_rate": 5.00,
    "education_levy_threshold": 5000.00,
    "education_levy_exemption": 541.67,
    "retirement_age": 65,
    "medical_benefits_senior_age": 60,
    "medical_benefits_max_age": 70,
    "updated_at": "2023-10-15T12:00:00.000Z"
  }
}
```

### Update Payroll Settings

Update payroll settings for Antigua.

- **URL:** `/payroll/settings`
- **Method:** `PUT`
- **Auth required:** Yes (Admin only)
- **Content-Type:** `application/json`

**Request Body:**
```json
{
  "socialSecurityEmployeeRate": 7.00,
  "socialSecurityEmployerRate": 9.00,
  "socialSecurityMaxInsurable": 6500.00,
  "medicalBenefitsEmployeeRate": 3.50,
  "medicalBenefitsEmployerRate": 3.50,
  "medicalBenefitsEmployeeSeniorRate": 2.50,
  "educationLevyRate": 2.50,
  "educationLevyHighRate": 5.00,
  "educationLevyThreshold": 5000.00,
  "educationLevyExemption": 541.67,
  "retirementAge": 65,
  "medicalBenefitsSeniorAge": 60,
  "medicalBenefitsMaxAge": 70
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Payroll settings updated successfully",
  "data": {
    "id": 1,
    "social_security_employee_rate": 7.00,
    "social_security_employer_rate": 9.00,
    "social_security_max_insurable": 6500.00,
    "medical_benefits_employee_rate": 3.50,
    "medical_benefits_employer_rate": 3.50,
    "medical_benefits_employee_senior_rate": 2.50,
    "education_levy_rate": 2.50,
    "education_levy_high_rate": 5.00,
    "education_levy_threshold": 5000.00,
    "education_levy_exemption": 541.67,
    "retirement_age": 65,
    "medical_benefits_senior_age": 60,
    "medical_benefits_max_age": 70,
    "updated_at": "2023-10-15T12:30:00.000Z"
  }
}
```

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error message",
  "error": {
    "details": "Additional error details if available"
  }
}
```

## Antigua Payroll Rules

The payroll calculation follows these specific Antigua rules:

### Social Security
- 16% of employee's gross salary is paid to Social Security monthly
  - 7% is deducted from the employee's gross salary (employee contribution)
  - 9% is paid by the employer (employer contribution)
- The maximum monthly insurable earning is $6,500.00
  - Contributions for employees making $6,500.00 or above are calculated based on this cap
- Employees at retirement age (65 in 2025) are exempt from Social Security contributions

### Medical Benefits
- 7% of employee's gross salary is paid to Medical Benefits monthly
  - 3.5% is deducted from the employee's gross salary (employee contribution)
  - 3.5% is paid by the employer (employer contribution)
- Employees over 60 but not yet 70:
  - 2.5% is deducted from the employee's gross salary (employee contribution)
  - 0% is paid by the employer (employer contribution)
- Employees over 70 are exempt from Medical Benefits contributions

### Education Levy
- For salaries below $5,000.00 per month:
  - (Monthly gross income - $541.67) × 2.5%
- For salaries above $5,000.00 per month:
  - For the first $5,000: (5,000 - $541.67) × 2.5%
  - For any amount over $5,000: (Amount over $5,000) × 5%
  - Sum both amounts for total Education Levy
- Employers do not contribute to Education Levy

## Vacation Entitlement System

The system automatically calculates vacation accrual based on hours worked:

### Accrual Calculation
- Annual PTO hours are divided by total annual work hours (2080) to find the accrual rate per hour
- Employees accrue vacation time for every hour worked
- Example: 80 annual PTO hours ÷ 2080 work hours = 0.038462 hours accrued per hour worked