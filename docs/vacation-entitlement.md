# Vacation Entitlement System API Documentation

This document provides detailed information about the Vacation Entitlement System API endpoints, data models, and integration with the payroll system.

## Overview

The Vacation Entitlement System allows administrators to:

1. Create and manage employee vacation entries
2. Track vacation hours within specific date ranges
3. Apply appropriate vacation pay during payroll calculation
4. View vacation data in reports and paystubs

## API Endpoints

All vacation management endpoints are available under the `/api/vacations` route and require admin privileges.

### Create Vacation Entry

**Endpoint:** `POST /api/vacations`

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "employee_id": 123,
  "start_date": "2025-07-01",
  "end_date": "2025-07-05",
  "total_hours": 40,
  "hourly_rate": 20.50,  // Optional, defaults to employee's standard rate
  "status": "pending"    // Optional, defaults to "pending"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vacation entry created successfully",
  "data": {
    "vacation": {
      "id": 1,
      "employee_id": 123,
      "employee_name": "John Doe",
      "employee_type": "hourly",
      "start_date": "2025-07-01",
      "end_date": "2025-07-05",
      "total_hours": 40,
      "hourly_rate": 20.50,
      "status": "pending",
      "created_by": 1,
      "created_at": "2025-07-24T12:00:00Z",
      "updated_at": "2025-07-24T12:00:00Z"
    }
  }
}
```

### Update Vacation Entry

**Endpoint:** `PUT /api/vacations/:id`

**Authentication:** Required (Admin only)

**Request Body:**
```json
{
  "start_date": "2025-07-01",    // Optional
  "end_date": "2025-07-05",      // Optional
  "total_hours": 40,             // Optional
  "hourly_rate": 20.50,          // Optional
  "status": "approved"           // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Vacation entry updated successfully",
  "data": {
    "vacation": {
      "id": 1,
      "employee_id": 123,
      "employee_name": "John Doe",
      "employee_type": "hourly",
      "start_date": "2025-07-01",
      "end_date": "2025-07-05",
      "total_hours": 40,
      "hourly_rate": 20.50,
      "status": "approved",
      "created_by": 1,
      "created_at": "2025-07-24T12:00:00Z",
      "updated_at": "2025-07-24T12:30:00Z"
    }
  }
}
```

### Delete Vacation Entry

**Endpoint:** `DELETE /api/vacations/:id`

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Vacation entry deleted successfully"
}
```

### Get Vacation Entry

**Endpoint:** `GET /api/vacations/:id`

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Vacation entry retrieved successfully",
  "data": {
    "vacation": {
      "id": 1,
      "employee_id": 123,
      "employee_name": "John Doe",
      "employee_type": "hourly",
      "start_date": "2025-07-01",
      "end_date": "2025-07-05",
      "total_hours": 40,
      "hourly_rate": 20.50,
      "status": "approved",
      "created_by": 1,
      "created_at": "2025-07-24T12:00:00Z",
      "updated_at": "2025-07-24T12:30:00Z"
    }
  }
}
```

### List All Vacation Entries

**Endpoint:** `GET /api/vacations`

**Authentication:** Required (Admin only)

**Query Parameters:**
- `employee_id`: Filter by employee ID
- `status`: Filter by status (pending, approved, cancelled)
- `start_date`: Filter by vacation start date
- `end_date`: Filter by vacation end date

**Response:**
```json
{
  "success": true,
  "message": "Vacation entries retrieved successfully",
  "data": {
    "count": 2,
    "vacations": [
      {
        "id": 1,
        "employee_id": 123,
        "employee_name": "John Doe",
        "employee_type": "hourly",
        "start_date": "2025-07-01",
        "end_date": "2025-07-05",
        "total_hours": 40,
        "hourly_rate": 20.50,
        "status": "approved",
        "created_by": 1,
        "created_at": "2025-07-24T12:00:00Z",
        "updated_at": "2025-07-24T12:30:00Z"
      },
      {
        "id": 2,
        "employee_id": 456,
        "employee_name": "Jane Smith",
        "employee_type": "salary",
        "start_date": "2025-08-01",
        "end_date": "2025-08-10",
        "total_hours": 80,
        "hourly_rate": null,
        "status": "pending",
        "created_by": 1,
        "created_at": "2025-07-24T14:00:00Z",
        "updated_at": "2025-07-24T14:00:00Z"
      }
    ]
  }
}
```

### Get Vacation Entries for Employee

**Endpoint:** `GET /api/vacations/employee/:employeeId`

**Authentication:** Required (Admin only)

**Response:**
```json
{
  "success": true,
  "message": "Employee vacation entries retrieved successfully",
  "data": {
    "count": 1,
    "vacations": [
      {
        "id": 1,
        "employee_id": 123,
        "employee_name": "John Doe",
        "employee_type": "hourly",
        "start_date": "2025-07-01",
        "end_date": "2025-07-05",
        "total_hours": 40,
        "hourly_rate": 20.50,
        "status": "approved",
        "created_by": 1,
        "created_at": "2025-07-24T12:00:00Z",
        "updated_at": "2025-07-24T12:30:00Z"
      }
    ]
  }
}
```

## Data Model

### Employee Vacations Table

| Column        | Type         | Description                                    |
|---------------|--------------|------------------------------------------------|
| id            | int          | Primary key                                   |
| employee_id   | int          | Foreign key to employees table                |
| start_date    | date         | Vacation start date                           |
| end_date      | date         | Vacation end date                             |
| total_hours   | decimal(10,2)| Total vacation hours for this period          |
| hourly_rate   | decimal(10,2)| Hourly rate for vacation pay (for hourly employees) |
| status        | enum         | Status: 'pending', 'approved', 'cancelled'    |
| created_by    | int          | User ID who created the entry                 |
| created_at    | timestamp    | Creation timestamp                            |
| updated_at    | timestamp    | Last update timestamp                         |

## Payroll Integration

### Vacation Pay Calculation

1. **Hourly Employees**:
   - Vacation pay = Vacation hours × Hourly rate
   - Vacation pay is added to regular and overtime pay

2. **Salaried Employees**:
   - Vacation hours are tracked but do not affect pay
   - Salary already includes vacation pay
   - Vacation hours are reported for record-keeping

3. **Private Duty Nurses**:
   - Vacation pay = Vacation hours × Hourly rate
   - Vacation pay is added to regular pay

### YTD Tracking

Vacation hours and pay are tracked in YTD totals for reporting purposes:

- `ytd_vacation_hours`: Year-to-date total vacation hours
- `ytd_vacation_amount`: Year-to-date total vacation pay

### Paystub Display

Vacation details are shown on employee paystubs:
- Current period vacation hours and pay
- Year-to-date vacation hours and pay

## Status Workflow

1. **Pending** - Initial status when vacation is first entered
2. **Approved** - Vacation is approved and will be included in payroll
3. **Cancelled** - Vacation is cancelled and will not be included in payroll
