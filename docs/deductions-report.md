# Deductions Report

This document outlines the new Deductions Report functionality that provides management-focused insights on employee contributions to social security, education levy, and medical benefits.

## Overview

The Deductions Report allows management to view and analyze employee contributions across different deduction types. It supports filtering by all employees, date range, or department.

## API Endpoint

### Get Deductions Report
- **URL**: `/api/payroll/deductions-report`
- **Method**: `GET`
- **Authentication**: Required (Admin only)
- **Query Parameters**:
  - `filterType`: Type of filter to apply (Options: 'all', 'range', 'dept')
  - `startDate`: Start date for range filter (Required if filterType is 'range')
  - `endDate`: End date for range filter (Required if filterType is 'range')
  - `departmentId`: Department ID for department filter (Required if filterType is 'dept')
  - `includeInactive`: Whether to include inactive employees (Default: false)
  - `format`: Output format ('json' or 'csv', Default: 'json')

### Example Requests

#### Get All Employees Report
```
GET /api/payroll/deductions-report?filterType=all
```

#### Get Report Filtered by Date Range
```
GET /api/payroll/deductions-report?filterType=range&startDate=2025-01-01&endDate=2025-12-31
```

#### Get Report Filtered by Department
```
GET /api/payroll/deductions-report?filterType=dept&departmentId=1
```

#### Get Report in CSV Format
```
GET /api/payroll/deductions-report?filterType=all&format=csv
```

## Report Structure

The report contains the following data:

### JSON Format
```json
{
  "success": true,
  "message": "Deductions report generated successfully",
  "data": {
    "rows": [
      {
        "employee_id": "001",
        "name": "John Doe",
        "department": "Administration",
        "gross_pay": "3000.0",
        "net_pay": "2500.0",
        "ss_employee": "90.0",
        "ss_employer": "120.0",
        "mb_employee": "45.0",
        "mb_employer": "60.0",
        "el_employee": "30.0",
        "el_employer": "0.0"
      }
    ],
    "totals": {
      "gross_pay": "3000.0",
      "net_pay": "2500.0",
      "ss_employee": "90.0",
      "ss_employer": "120.0",
      "mb_employee": "45.0",
      "mb_employer": "60.0",
      "el_employee": "30.0",
      "el_employer": "0.0"
    }
  }
}
```

### CSV Format
```
Employee ID,Name,Gross Pay,Net Pay,SS (EE),SS (ER),MB (EE),MB (ER),EL (EE),EL (ER)
001,John Doe,3000.0,2500.0,90.0,120.0,45.0,60.0,30.0,0.0
002,Jane Smith,3200.0,2700.0,96.0,128.0,48.0,64.0,32.0,0.0
003,Alice Johnson,2800.0,2350.0,84.0,112.0,42.0,56.0,28.0,0.0
,,9000.0,7550.0,270.0,360.0,135.0,180.0,90.0,0.0
```

## Abbreviations

- **SS (EE)**: Social Security Employee Contribution
- **SS (ER)**: Social Security Employer Contribution
- **MB (EE)**: Medical Benefits Employee Contribution
- **MB (ER)**: Medical Benefits Employer Contribution
- **EL (EE)**: Education Levy Employee Contribution
- **EL (ER)**: Education Levy Employer Contribution (Always 0, as this is fully employee paid)
