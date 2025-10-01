# Custom Period Dates Tracking

## Overview

This feature tracks when payroll calculations are performed using custom date ranges that differ from the uploaded timesheet period dates. This ensures paystubs display accurate calculation dates and provides visibility into which payroll runs used custom dates.

## Problem Solved

Previously, when users uploaded a timesheet CSV for Oct 1-30 but wanted to calculate payroll for only Oct 1-25, the system would:
- ✅ Correctly filter timesheet entries to Oct 1-25 for calculation
- ❌ Show Oct 1-30 on paystubs (misleading)
- ❌ Not track which runs used custom dates

Now the system:
- ✅ Stores custom dates in `payroll_runs` table
- ✅ Displays actual calculation dates on paystubs
- ✅ Flags timesheet periods that have custom date payroll runs
- ✅ Provides detailed information about custom date usage

## Database Changes

### Migration: `037_add_custom_period_dates_to_payroll_runs.js`

Adds two nullable columns to the `payroll_runs` table:

```sql
ALTER TABLE payroll_runs
ADD COLUMN custom_period_start DATE NULL COMMENT 'Custom period start date if different from timesheet period',
ADD COLUMN custom_period_end DATE NULL COMMENT 'Custom period end date if different from timesheet period'
```

**When these columns are populated:**
- `custom_period_start`: Set when `periodStart` in the API request differs from timesheet period's `period_start`
- `custom_period_end`: Set when `periodEnd` in the API request differs from timesheet period's `period_end`
- Both can be `NULL` if default dates were used

## Backend Changes

### 1. Payroll Calculation (`models/Payroll.js`)

**Updated `calculateForPeriod` method:**

```javascript
// Detect custom dates
const customStartDate = (options.periodStart && options.periodStart !== period.period_start) 
  ? startDate : null;
const customEndDate = (options.periodEnd && options.periodEnd !== period.period_end) 
  ? endDate : null;

// Store in payroll_runs table
await connection.query(
  `UPDATE payroll_runs SET 
    status = ?, 
    total_employees = ?,
    total_gross = (SELECT SUM(gross_pay) FROM payroll_items WHERE payroll_run_id = ?),
    total_net = (SELECT SUM(net_pay) FROM payroll_items WHERE payroll_run_id = ?),
    custom_period_start = ?,
    custom_period_end = ?
  WHERE id = ?`,
  [status, totalEmployees, payrollRunId, payrollRunId, customStartDate, customEndDate, payrollRunId]
);
```

**Logic:**
- Compares provided dates with timesheet period defaults
- Stores dates ONLY if they differ from defaults
- NULL values indicate default dates were used

### 2. Paystub Generation (`controllers/payrollController.js`)

**Updated `downloadPaystub` endpoint:**

```javascript
// Use custom dates if they were used during calculation, otherwise use default period dates
const actualStartDate = payrollRun.custom_period_start || payrollRun.period_start;
const actualEndDate = payrollRun.custom_period_end || payrollRun.period_end;

const periodData = {
  periodStart: actualStartDate ? new Date(actualStartDate).toLocaleDateString() : 'N/A',
  periodEnd: actualEndDate ? new Date(actualEndDate).toLocaleDateString() : 'N/A',
  payDate: payrollRun.pay_date ? new Date(payrollRun.pay_date).toLocaleDateString() : new Date().toLocaleDateString(),
  // Include flag to indicate if custom dates were used
  usedCustomDates: !!(payrollRun.custom_period_start || payrollRun.custom_period_end)
};
```

**Result:**
- Paystubs display the **actual dates used for calculation**
- `usedCustomDates` flag available for PDF template customization

### 3. Timesheet Period APIs (`models/Timesheet.js`)

**Updated `getAllPeriods` and `getPeriodById` methods:**

```javascript
SELECT 
  tp.*,
  u.name as created_by_name,
  (SELECT COUNT(*) FROM timesheet_entries WHERE period_id = tp.id) as entry_count,
  -- Count payroll runs with custom dates
  (SELECT COUNT(*) FROM payroll_runs 
   WHERE period_id = tp.id 
   AND (custom_period_start IS NOT NULL OR custom_period_end IS NOT NULL)) as custom_date_runs_count,
  -- Detailed info about custom date runs
  (SELECT GROUP_CONCAT(
    CONCAT(
      'Run #', pr.id, 
      ' (', COALESCE(DATE_FORMAT(pr.custom_period_start, '%Y-%m-%d'), 'default'), 
      ' to ', COALESCE(DATE_FORMAT(pr.custom_period_end, '%Y-%m-%d'), 'default'), ')'
    ) SEPARATOR '; '
  )
  FROM payroll_runs pr
  WHERE pr.period_id = tp.id 
  AND (pr.custom_period_start IS NOT NULL OR pr.custom_period_end IS NOT NULL)) as custom_date_runs_info
FROM timesheet_periods tp
```

**Response includes:**
- `hasCustomDateRuns` (boolean): True if any payroll run used custom dates
- `customDateRunsCount` (number): Count of runs with custom dates
- `customDateRunsInfo` (string): Detailed summary like "Run #42 (2024-10-01 to 2024-10-25); Run #43 (2024-10-26 to 2024-10-31)"

## API Usage

### Scenario 1: Upload Timesheet for Full Month

**Upload CSV with Oct 1-30 data:**
```bash
POST /api/payroll/upload-timesheet
# Uploads CSV, creates timesheet period with period_start=2024-10-01, period_end=2024-10-31
```

### Scenario 2: Calculate Payroll for First 25 Days

**Calculate with custom dates:**
```bash
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-25",
  "payDate": "2024-10-28"
}
```

**Result:**
- `payroll_runs.custom_period_start = 2024-10-01`
- `payroll_runs.custom_period_end = 2024-10-25`
- Paystub shows Oct 1-25, not Oct 1-30
- Timesheet period dates remain Oct 1-30 (unchanged)

### Scenario 3: Calculate Payroll for Remaining Days

**Calculate for Oct 26-31:**
```bash
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-26",
  "periodEnd": "2024-10-31",
  "payDate": "2024-11-05"
}
```

**Result:**
- New payroll run created
- `payroll_runs.custom_period_start = 2024-10-26`
- `payroll_runs.custom_period_end = 2024-10-31`
- Paystub shows Oct 26-31

### Scenario 4: Check Timesheet Period Status

**Get timesheet periods:**
```bash
GET /api/payroll/timesheet-periods
```

**Response:**
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

**Interpretation:**
- Timesheet uploaded for full month (Oct 1-31)
- 2 payroll runs used custom dates
- Run #42 calculated for Oct 1-25
- Run #43 calculated for Oct 26-31

## Frontend Implementation Guide

### Display Warning When Custom Dates Differ

```javascript
function TimesheetPeriodList({ periods }) {
  return (
    <div>
      {periods.map(period => (
        <div key={period.id} className="period-card">
          <h3>{period.report_title}</h3>
          <p>Period: {period.period_start} to {period.period_end}</p>
          
          {period.hasCustomDateRuns && (
            <div className="alert alert-info">
              <strong>⚠️ Custom Date Calculations Detected</strong>
              <p>
                This timesheet period has {period.customDateRunsCount} payroll run(s) 
                that used different dates than the uploaded timesheet:
              </p>
              <p className="small">{period.customDateRunsInfo}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Paystub Date Display

```javascript
function PaystubDateDisplay({ periodData }) {
  return (
    <div className="paystub-header">
      <h2>Pay Period</h2>
      <p>{periodData.periodStart} - {periodData.periodEnd}</p>
      
      {periodData.usedCustomDates && (
        <span className="badge badge-warning">
          Custom Date Range
        </span>
      )}
    </div>
  );
}
```

## Testing Checklist

### Database Migration
- [ ] Run migration `037_add_custom_period_dates_to_payroll_runs.js`
- [ ] Verify columns exist: `custom_period_start`, `custom_period_end`
- [ ] Verify columns are nullable
- [ ] Verify existing payroll runs have NULL values

### Payroll Calculation
- [ ] Calculate with default dates → custom columns should be NULL
- [ ] Calculate with custom dates → custom columns should store the dates
- [ ] Calculate with only custom start → only start column populated
- [ ] Calculate with only custom end → only end column populated

### Paystub Generation
- [ ] Paystub with default dates → shows timesheet period dates
- [ ] Paystub with custom dates → shows custom dates
- [ ] Paystub includes `usedCustomDates` flag in periodData

### Timesheet Period APIs
- [ ] `GET /api/payroll/timesheet-periods` includes custom date info
- [ ] `GET /api/payroll/timesheet-periods/:id` includes custom date info
- [ ] `hasCustomDateRuns` is false when no custom dates used
- [ ] `hasCustomDateRuns` is true when custom dates used
- [ ] `customDateRunsInfo` contains accurate summary

### Edge Cases
- [ ] Multiple runs with different custom dates for same period
- [ ] Mixed runs: some with custom dates, some without
- [ ] Custom dates that match default dates (should store as NULL)
- [ ] Partial custom dates (only start or only end)

## Benefits

1. **Accurate Paystubs**: Employees see the exact dates their pay was calculated for
2. **Audit Trail**: Track when and how custom dates were used
3. **Period Visibility**: Quickly identify which periods have split calculations
4. **Data Integrity**: Maintain timesheet data while allowing flexible calculations
5. **Transparency**: Clear indication of custom vs. default date usage

## Migration Instructions

### Step 1: Run Database Migration
```bash
# From project root
node migrations/037_add_custom_period_dates_to_payroll_runs.js
```

### Step 2: Deploy Backend Code
- Deploy updated `models/Payroll.js`
- Deploy updated `models/Timesheet.js`
- Deploy updated `controllers/payrollController.js`

### Step 3: No Frontend Changes Required
- Existing frontend will continue to work
- Enhanced data automatically available in API responses
- Implement custom date warnings/badges as needed

### Step 4: Test the Feature
Follow the testing checklist above to verify all functionality.

## Troubleshooting

### Custom dates not being stored
- Check that dates differ from period defaults
- Verify migration ran successfully
- Check calculation logs for date comparison

### Paystubs showing wrong dates
- Verify `custom_period_start/end` in `payroll_runs` table
- Check `getPayrollRunById` returns custom dates
- Verify `downloadPaystub` uses correct fallback logic

### Custom date info not appearing in timesheet periods
- Verify SQL query joins payroll_runs correctly
- Check that GROUP_CONCAT limit not exceeded
- Verify response processing adds flags correctly
