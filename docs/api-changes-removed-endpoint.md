# API Changes - Custom Period Dates Feature

## Removed Endpoints

### ~~PUT /api/payroll/timesheet-periods/:id/dates~~ (REMOVED)

**Why removed:** 
With the introduction of `custom_period_start` and `custom_period_end` columns in the `payroll_runs` table, there's no need to modify the original timesheet period dates. The uploaded timesheet period dates should remain as-is to preserve the integrity of the uploaded data.

**Previous functionality:**
This endpoint allowed updating the `period_start` and `period_end` dates in the `timesheet_periods` table.

**New approach:**
Instead of modifying timesheet period dates, simply pass `periodStart` and `periodEnd` parameters to the payroll calculation endpoint:

```bash
# OLD WAY (No longer available):
PUT /api/payroll/timesheet-periods/123/dates
{
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-25"
}

POST /api/payroll/calculate
{
  "periodId": 123
}

# NEW WAY (Recommended):
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-25"
}
```

**Benefits of new approach:**
1. ✅ Timesheet period dates remain unchanged (data integrity)
2. ✅ Custom dates stored per payroll run (flexibility)
3. ✅ Multiple payroll runs can use different date ranges from same timesheet
4. ✅ Complete audit trail of which dates were used for each calculation

## Current API Endpoints

### Timesheet Period Endpoints

#### GET /api/payroll/timesheet-periods
**Purpose:** List all timesheet periods with custom date information

**Response includes:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "report_title": "October 2024 Timesheet",
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "entry_count": 450,
      "hasCustomDateRuns": true,
      "customDateRunsCount": 2,
      "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-25); Run #43 (2024-10-26 to 2024-10-31)"
    }
  ]
}
```

#### GET /api/payroll/timesheet-periods/:id
**Purpose:** Get specific timesheet period with entries and custom date information

**Response includes:**
```json
{
  "success": true,
  "data": {
    "period": {
      "id": 123,
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "hasCustomDateRuns": true,
      "customDateRunsCount": 2,
      "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-25); Run #43 (2024-10-26 to 2024-10-31)"
    },
    "entries": [...]
  }
}
```

### Payroll Calculation Endpoint

#### POST /api/payroll/calculate
**Purpose:** Calculate payroll with optional custom date range

**Request body:**
```json
{
  "periodId": 123,
  "periodStart": "2024-10-01",  // Optional: custom start date
  "periodEnd": "2024-10-25",     // Optional: custom end date
  "payDate": "2024-10-28"        // Optional: payment date
}
```

**Behavior:**
- If `periodStart` and `periodEnd` are provided and differ from timesheet period dates:
  - Uses custom dates for calculation
  - Stores custom dates in `payroll_runs.custom_period_start` and `custom_period_end`
- If custom dates are NOT provided:
  - Uses timesheet period dates from `timesheet_periods` table
  - Sets `custom_period_start` and `custom_period_end` to NULL

## Migration Guide

If you were using the removed endpoint in your frontend:

### Before (OLD):
```javascript
// Step 1: Update timesheet period dates
await fetch('/api/payroll/timesheet-periods/123/dates', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    periodStart: '2024-10-01',
    periodEnd: '2024-10-25'
  })
});

// Step 2: Calculate payroll
await fetch('/api/payroll/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    periodId: 123
  })
});
```

### After (NEW):
```javascript
// Single step: Calculate with custom dates
await fetch('/api/payroll/calculate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    periodId: 123,
    periodStart: '2024-10-01',
    periodEnd: '2024-10-25'
  })
});
```

## Summary

The removal of the `updatePeriodDates` endpoint simplifies the API and makes the system more robust:

- **Simpler workflow:** One API call instead of two
- **Data integrity:** Original timesheet dates never modified
- **Better flexibility:** Multiple runs with different dates from same timesheet
- **Clear intent:** Custom dates explicitly passed with each calculation
