# Custom Period Dates - API Documentation

## Overview

This feature allows you to calculate payroll for custom date ranges without modifying the original uploaded timesheet period. The custom dates are stored separately in the `payroll_runs` table.

---

## 🆕 What Changed

### Modified Endpoints

1. **POST /api/payroll/calculate** - Now accepts optional custom date parameters
2. **GET /api/payroll/timesheet-periods** - Now returns custom date run information
3. **GET /api/payroll/timesheet-periods/:id** - Now returns custom date run information
4. **GET /api/payroll/paystub/:payrollRunId/:employeeId** - Automatically uses custom dates if present

### Removed Endpoints

- **PUT /api/payroll/timesheet-periods/:id/dates** - No longer needed (custom dates stored in payroll_runs)

---

## API Endpoints

### 1. Calculate Payroll (Modified)

**Endpoint:** `POST /api/payroll/calculate`

**Purpose:** Calculate payroll for a timesheet period with optional custom date range

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `periodId` | number | ✅ Yes | ID of the timesheet period |
| `payDate` | string (YYYY-MM-DD) | No | Pay date (defaults to today) |
| `periodStart` | string (YYYY-MM-DD) | No | **NEW:** Custom start date for calculation |
| `periodEnd` | string (YYYY-MM-DD) | No | **NEW:** Custom end date for calculation |

#### Request Examples

**Example 1: Full Period Calculation (Default)**
```json
POST /api/payroll/calculate
{
  "periodId": 123,
  "payDate": "2024-10-31"
}
```
- Uses timesheet period's default dates (period_start to period_end)
- `custom_period_start` and `custom_period_end` will be **NULL** in database

**Example 2: Custom Date Range Calculation**
```json
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-15",
  "payDate": "2024-10-18"
}
```
- Only timesheet entries between Oct 1-15 will be included
- `custom_period_start = 2024-10-01` and `custom_period_end = 2024-10-15` stored in database

**Example 3: Split Monthly Payroll into Two Runs**
```json
// First half of month
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-15",
  "payDate": "2024-10-18"
}

// Second half of month
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-16",
  "periodEnd": "2024-10-31",
  "payDate": "2024-11-02"
}
```

#### Response

```json
{
  "success": true,
  "message": "Payroll calculated successfully",
  "data": {
    "payrollRunId": 42,
    "periodId": 123,
    "payDate": "2024-10-18",
    "totalEmployees": 25,
    "totalGrossPay": 125000.50,
    "totalNetPay": 98500.25,
    "payrollItems": [
      {
        "id": 1001,
        "employee_id": "EMP001",
        "employeeName": "John Doe",
        "hours_worked": 80,
        "gross_pay": 5000.00,
        "net_pay": 3900.00,
        // ... other fields
      }
      // ... more items
    ],
    "errors": null
  }
}
```

#### Backend Behavior

1. Creates `payroll_run` record with status `processing`
2. If `periodStart`/`periodEnd` provided:
   - Uses these dates for calculation
   - Filters timesheet entries to this date range
   - Stores as `custom_period_start` and `custom_period_end` in `payroll_runs` table
3. If NOT provided:
   - Uses timesheet period's `period_start` and `period_end`
   - `custom_period_start` and `custom_period_end` remain **NULL**
4. Calculates payroll items
5. Updates status to `completed`

---

### 2. Get Timesheet Periods (Modified)

**Endpoint:** `GET /api/payroll/timesheet-periods`

**Purpose:** Get all timesheet periods with custom date run information

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Results per page |

#### Request Example

```
GET /api/payroll/timesheet-periods?page=1&limit=10
```

#### Response

```json
{
  "success": true,
  "message": "Timesheet periods retrieved successfully",
  "data": [
    {
      "id": 123,
      "report_title": "October 2024 Timesheet",
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "created_by": 1,
      "created_by_name": "Admin User",
      "created_at": "2024-10-01T10:00:00.000Z",
      "entry_count": 450,
      
      // 🆕 NEW FIELDS
      "hasCustomDateRuns": true,
      "customDateRunsCount": 2,
      "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-15); Run #43 (2024-10-16 to 2024-10-31)"
    },
    {
      "id": 122,
      "report_title": "September 2024 Timesheet",
      "period_start": "2024-09-01",
      "period_end": "2024-09-30",
      "created_by": 1,
      "created_by_name": "Admin User",
      "created_at": "2024-09-01T10:00:00.000Z",
      "entry_count": 425,
      
      // 🆕 No custom runs for this period
      "hasCustomDateRuns": false,
      "customDateRunsCount": 0,
      "customDateRunsInfo": null
    }
  ]
}
```

#### New Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| `hasCustomDateRuns` | boolean | `true` if any payroll run used custom dates for this period |
| `customDateRunsCount` | number | Number of payroll runs with custom dates |
| `customDateRunsInfo` | string/null | Human-readable info about custom runs (e.g., "Run #42 (2024-10-01 to 2024-10-15)") |

---

### 3. Get Timesheet Period by ID (Modified)

**Endpoint:** `GET /api/payroll/timesheet-periods/:id`

**Purpose:** Get specific timesheet period with entries and custom date run info

#### Request Example

```
GET /api/payroll/timesheet-periods/123
```

#### Response

```json
{
  "success": true,
  "message": "Timesheet period retrieved successfully",
  "data": {
    "period": {
      "id": 123,
      "report_title": "October 2024 Timesheet",
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "created_by": 1,
      "created_by_name": "Admin User",
      "created_at": "2024-10-01T10:00:00.000Z",
      
      // 🆕 NEW FIELDS
      "hasCustomDateRuns": true,
      "customDateRunsCount": 2,
      "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-15); Run #43 (2024-10-16 to 2024-10-31)"
    },
    "entries": [
      {
        "id": 1,
        "employee_id": "EMP001",
        "first_name": "John",
        "last_name": "Doe",
        "work_date": "2024-10-01",
        "time_in": "09:00:00",
        "time_out": "17:00:00",
        "total_hours": "8:00",
        "hours_decimal": 8.0
        // ... other fields
      }
      // ... more entries
    ]
  }
}
```

---

### 4. Get Payroll Runs (Modified)

**Endpoint:** `GET /api/payroll/reports`

**Purpose:** Get all payroll runs with custom date information

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `limit` | number | No | 10 | Results per page |

#### Request Example

```
GET /api/payroll/reports?page=1&limit=10
```

#### Response

```json
{
  "success": true,
  "message": "Payroll reports retrieved successfully",
  "data": [
    {
      "id": 42,
      "period_id": 123,
      "report_title": "October 2024 Timesheet",
      
      // Original timesheet period dates
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      
      // 🆕 NEW: Custom dates used for THIS calculation (if different)
      "custom_period_start": "2024-10-01",
      "custom_period_end": "2024-10-15",
      
      "pay_date": "2024-10-18",
      "status": "completed",
      "total_gross_pay": 62500.00,
      "total_net_pay": 49250.00,
      "created_by": 1,
      "created_by_name": "Admin User",
      "created_at": "2024-10-15T14:30:00.000Z",
      "item_count": 25
    },
    {
      "id": 41,
      "period_id": 122,
      "report_title": "September 2024 Timesheet",
      
      // Original timesheet period dates
      "period_start": "2024-09-01",
      "period_end": "2024-09-30",
      
      // 🆕 NULL = used full period (default dates)
      "custom_period_start": null,
      "custom_period_end": null,
      
      "pay_date": "2024-09-30",
      "status": "finalized",
      "total_gross_pay": 120000.00,
      "total_net_pay": 95000.00,
      "created_by": 1,
      "created_by_name": "Admin User",
      "created_at": "2024-09-28T16:00:00.000Z",
      "item_count": 25
    }
  ]
}
```

#### How to Interpret Custom Date Fields

```javascript
// Check if custom dates were used
if (run.custom_period_start || run.custom_period_end) {
  // This run used CUSTOM dates
  const actualStart = run.custom_period_start;
  const actualEnd = run.custom_period_end;
  console.log(`Custom calculation: ${actualStart} to ${actualEnd}`);
} else {
  // This run used FULL PERIOD dates
  const actualStart = run.period_start;
  const actualEnd = run.period_end;
  console.log(`Full period calculation: ${actualStart} to ${actualEnd}`);
}
```

---

### 5. Download Paystub (Auto-Updated)

**Endpoint:** `GET /api/payroll/paystub/:payrollRunId/:employeeId`

**Purpose:** Download PDF paystub for an employee (automatically uses correct dates)

#### Request Example

```
GET /api/payroll/paystub/42/EMP001
```

#### Backend Behavior (No Frontend Changes Needed)

The paystub PDF **automatically** shows the correct dates:

```javascript
// Backend logic (automatic)
const actualStartDate = payrollRun.custom_period_start || payrollRun.period_start;
const actualEndDate = payrollRun.custom_period_end || payrollRun.period_end;

// PDF displays:
// Period: October 1, 2024 - October 15, 2024  (if custom dates used)
// OR
// Period: October 1, 2024 - October 31, 2024  (if full period)
```

#### Response

- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename=paystub-John-Doe-42.pdf`
- **Body:** PDF binary data

---

## Common Frontend Scenarios

### Scenario 1: Display Period with Custom Run Indicator

```javascript
// In your periods list component
periods.map(period => {
  if (period.hasCustomDateRuns) {
    // Show badge: "Has 2 custom run(s)"
    // Show details: period.customDateRunsInfo
  }
})
```

### Scenario 2: Display Payroll Run with Correct Dates

```javascript
// In your payroll runs list
runs.map(run => {
  const displayStart = run.custom_period_start || run.period_start;
  const displayEnd = run.custom_period_end || run.period_end;
  const isCustom = !!(run.custom_period_start || run.custom_period_end);
  
  // Show: "Oct 1 - Oct 15" with "CUSTOM" badge
  // OR: "Oct 1 - Oct 31" (normal)
})
```

### Scenario 3: Calculate Payroll Form

```javascript
// Option 1: Full period (default)
const payload = {
  periodId: 123,
  payDate: "2024-10-31"
  // Don't include periodStart/periodEnd
};

// Option 2: Custom date range
const payload = {
  periodId: 123,
  periodStart: "2024-10-01",
  periodEnd: "2024-10-15",
  payDate: "2024-10-18"
};

// Send to: POST /api/payroll/calculate
```

---

## Database Schema Changes

### New Columns in `payroll_runs` Table

```sql
ALTER TABLE payroll_runs 
ADD COLUMN custom_period_start DATE NULL,
ADD COLUMN custom_period_end DATE NULL;
```

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `custom_period_start` | DATE | Yes | Start date used for calculation (NULL = used period default) |
| `custom_period_end` | DATE | Yes | End date used for calculation (NULL = used period default) |

---

## Validation Rules

### Backend Validation

The backend automatically validates:

1. ✅ `periodStart` must be >= timesheet `period_start`
2. ✅ `periodEnd` must be <= timesheet `period_end`
3. ✅ `periodStart` must be <= `periodEnd`
4. ✅ Both or neither must be provided (can't provide just one)

### Error Responses

```json
// Invalid date range
{
  "success": false,
  "message": "Custom period dates must be within the timesheet period range"
}

// Start date after end date
{
  "success": false,
  "message": "Period start date must be before or equal to end date"
}

// Missing end date
{
  "success": false,
  "message": "Both periodStart and periodEnd must be provided together"
}
```

---

## Migration Guide

### Before (Old Behavior)
- Calculate payroll for full period only
- To split month, had to upload separate timesheets
- No tracking of which dates were used

### After (New Behavior)
- Calculate payroll for any date range within uploaded period
- Upload once, calculate multiple times with different ranges
- Track custom dates in each payroll run
- Paystubs show actual calculation dates

### Breaking Changes
- ❌ Removed `PUT /api/payroll/timesheet-periods/:id/dates` endpoint
- ✅ Use custom dates in calculate endpoint instead

---

## Quick Reference

| Action | Endpoint | Method | New Params |
|--------|----------|--------|------------|
| Calculate full period | `/api/payroll/calculate` | POST | None (default behavior) |
| Calculate custom range | `/api/payroll/calculate` | POST | `periodStart`, `periodEnd` |
| Get periods with custom info | `/api/payroll/timesheet-periods` | GET | None (auto-included) |
| Get runs with custom dates | `/api/payroll/reports` | GET | None (auto-included) |
| Download paystub | `/api/payroll/paystub/:runId/:empId` | GET | None (auto-handles dates) |

---

## Example Use Case: Split Monthly Payroll

**Scenario:** Split October payroll into two payments

```bash
# Step 1: Upload timesheet (Oct 1-31)
POST /api/payroll/upload-timesheet
# Creates period ID: 123

# Step 2: Calculate first half (Oct 1-15)
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-15",
  "payDate": "2024-10-18"
}
# Creates payroll run #42
# custom_period_start: 2024-10-01
# custom_period_end: 2024-10-15

# Step 3: Calculate second half (Oct 16-31)
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-16",
  "periodEnd": "2024-10-31",
  "payDate": "2024-11-02"
}
# Creates payroll run #43
# custom_period_start: 2024-10-16
# custom_period_end: 2024-10-31

# Step 4: Check period
GET /api/payroll/timesheet-periods/123
# Response shows:
# hasCustomDateRuns: true
# customDateRunsCount: 2
# customDateRunsInfo: "Run #42 (2024-10-01 to 2024-10-15); Run #43 (2024-10-16 to 2024-10-31)"
```

**Result:**
- ✅ Original timesheet period unchanged (Oct 1-31)
- ✅ Two payroll runs created with different date ranges
- ✅ Paystubs show correct dates for each payment
- ✅ No duplicate or modified data

---

## Questions?

Refer to other documentation files:
- Full feature guide: `/docs/custom-period-dates-tracking.md`
- Migration details: `/docs/migration-guide-custom-period-dates.md`
