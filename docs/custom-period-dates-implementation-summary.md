# Custom Period Dates Feature - Implementation Summary

## What Was Implemented

This feature ensures that when payroll is calculated using custom date ranges (different from the uploaded timesheet period dates), the **actual calculation dates** are:
1. Stored in the database
2. Displayed on paystubs
3. Visible in timesheet period listings

## The Problem

**Scenario:** 
- Upload timesheet CSV with data from Oct 1-30
- Calculate payroll for only Oct 1-25 using custom dates
- Generate paystub

**Before this feature:**
- ✅ Calculation correctly uses Oct 1-25 data
- ❌ Paystub shows Oct 1-30 (incorrect/misleading)
- ❌ No way to know which runs used custom dates

**After this feature:**
- ✅ Calculation uses Oct 1-25 data
- ✅ Paystub shows Oct 1-25 (accurate)
- ✅ Timesheet period API indicates custom dates were used

## Files Modified

### 1. Database Migration
**File:** `migrations/037_add_custom_period_dates_to_payroll_runs.js`

**Changes:**
- Added `custom_period_start DATE NULL` to `payroll_runs` table
- Added `custom_period_end DATE NULL` to `payroll_runs` table

**Purpose:** Store the actual dates used for payroll calculation when they differ from timesheet period defaults.

### 2. Payroll Model
**File:** `models/Payroll.js`

**Changes in `calculateForPeriod` method:**
```javascript
// Lines 679-684: Detect and store custom dates
const customStartDate = (options.periodStart && options.periodStart !== period.period_start) 
  ? startDate : null;
const customEndDate = (options.periodEnd && options.periodEnd !== period.period_end) 
  ? endDate : null;

// Update payroll_runs with custom dates
await connection.query(
  `UPDATE payroll_runs SET 
    ...
    custom_period_start = ?,
    custom_period_end = ?
  WHERE id = ?`,
  [..., customStartDate, customEndDate, payrollRunId]
);
```

**Logic:**
- Compares API-provided dates with database period dates
- Stores dates ONLY if they differ
- NULL = default dates were used

### 3. Paystub Controller
**File:** `controllers/payrollController.js`

**Changes in `downloadPaystub` method:**
```javascript
// Lines 572-585: Use custom dates for paystub display
const actualStartDate = payrollRun.custom_period_start || payrollRun.period_start;
const actualEndDate = payrollRun.custom_period_end || payrollRun.period_end;

const periodData = {
  periodStart: actualStartDate ? new Date(actualStartDate).toLocaleDateString() : 'N/A',
  periodEnd: actualEndDate ? new Date(actualEndDate).toLocaleDateString() : 'N/A',
  payDate: payrollRun.pay_date ? new Date(payrollRun.pay_date).toLocaleDateString() : new Date().toLocaleDateString(),
  usedCustomDates: !!(payrollRun.custom_period_start || payrollRun.custom_period_end)
};
```

**Result:**
- Paystubs show actual calculation dates
- `usedCustomDates` flag available for UI indicators

### 4. Timesheet Model
**File:** `models/Timesheet.js`

**Changes in `getAllPeriods` and `getPeriodById` methods:**

Added SQL subqueries to detect custom date usage:
```sql
-- Count runs with custom dates
(SELECT COUNT(*) FROM payroll_runs 
 WHERE period_id = tp.id 
 AND (custom_period_start IS NOT NULL OR custom_period_end IS NOT NULL)) 
 as custom_date_runs_count

-- Get detailed info about custom runs
(SELECT GROUP_CONCAT(
  CONCAT('Run #', pr.id, ' (', ..., ')')
  SEPARATOR '; '
) FROM payroll_runs pr
 WHERE pr.period_id = tp.id 
 AND (custom_period_start IS NOT NULL OR custom_period_end IS NOT NULL)) 
 as custom_date_runs_info
```

Added computed properties:
```javascript
{
  ...period,
  hasCustomDateRuns: period.custom_date_runs_count > 0,
  customDateRunsCount: period.custom_date_runs_count || 0,
  customDateRunsInfo: period.custom_date_runs_info || null
}
```

**Result:**
- Timesheet period API responses include custom date warnings
- Frontend can display alerts when custom dates were used

### 5. Documentation
**File:** `docs/custom-period-dates-tracking.md`

**Contents:**
- Complete feature overview
- Database schema changes
- API usage examples
- Frontend implementation guide
- Testing checklist
- Troubleshooting guide

## API Response Changes

### GET /api/payroll/timesheet-periods

**Before:**
```json
{
  "id": 123,
  "report_title": "October 2024 Timesheet",
  "period_start": "2024-10-01",
  "period_end": "2024-10-31",
  "entry_count": 450
}
```

**After:**
```json
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
```

### GET /api/payroll/paystub/:payrollRunId/:employeeId

**Before:**
```javascript
periodData = {
  periodStart: "10/1/2024",  // Always from timesheet_periods
  periodEnd: "10/31/2024",    // Always from timesheet_periods
  payDate: "10/28/2024"
}
```

**After:**
```javascript
periodData = {
  periodStart: "10/1/2024",   // From custom_period_start if set, else period_start
  periodEnd: "10/25/2024",     // From custom_period_end if set, else period_end
  payDate: "10/28/2024",
  usedCustomDates: true        // NEW: Indicates custom dates were used
}
```

## Usage Examples

### Example 1: Split Monthly Payroll into Two Periods

**Step 1: Upload full month timesheet**
```bash
POST /api/payroll/upload-timesheet
# Upload CSV with Oct 1-31 data
# Creates timesheet period 123 with period_start=2024-10-01, period_end=2024-10-31
```

**Step 2: Calculate first half**
```bash
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-15",
  "payDate": "2024-10-18"
}
# Creates payroll run 42
# Sets custom_period_start=2024-10-01, custom_period_end=2024-10-15
```

**Step 3: Calculate second half**
```bash
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-16",
  "periodEnd": "2024-10-31",
  "payDate": "2024-11-02"
}
# Creates payroll run 43
# Sets custom_period_start=2024-10-16, custom_period_end=2024-10-31
```

**Step 4: Check timesheet period**
```bash
GET /api/payroll/timesheet-periods/123
```

**Response:**
```json
{
  "id": 123,
  "period_start": "2024-10-01",
  "period_end": "2024-10-31",
  "hasCustomDateRuns": true,
  "customDateRunsCount": 2,
  "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-15); Run #43 (2024-10-16 to 2024-10-31)"
}
```

**Step 5: Generate paystubs**
- Run #42 paystubs show Oct 1-15
- Run #43 paystubs show Oct 16-31

### Example 2: Calculate Using Default Dates

```bash
POST /api/payroll/calculate
{
  "periodId": 123,
  "payDate": "2024-10-31"
}
# No periodStart/periodEnd provided
# Uses period_start and period_end from timesheet_periods
# custom_period_start = NULL, custom_period_end = NULL
```

**Result:**
- Paystub shows full period dates (Oct 1-31)
- `hasCustomDateRuns` remains false for this period

## Database Schema

### payroll_runs table (updated)

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | INT | NO | Primary key |
| period_id | INT | NO | Foreign key to timesheet_periods |
| pay_date | DATE | NO | Payment date |
| status | VARCHAR | NO | Processing status |
| total_employees | INT | YES | Employee count |
| total_gross | DECIMAL | YES | Total gross pay |
| total_net | DECIMAL | YES | Total net pay |
| **custom_period_start** | **DATE** | **YES** | **Custom start date (NEW)** |
| **custom_period_end** | **DATE** | **YES** | **Custom end date (NEW)** |
| created_by | INT | YES | User who created run |
| created_at | TIMESTAMP | NO | Creation timestamp |
| updated_at | TIMESTAMP | NO | Update timestamp |

## Backward Compatibility

✅ **Fully backward compatible**
- Existing payroll runs have NULL custom dates
- Existing API calls work without changes
- New fields are additive, not breaking
- Frontend can ignore new fields if not needed

## Testing Status

All modified files verified:
- ✅ `models/Payroll.js` - No errors
- ✅ `models/Timesheet.js` - No errors
- ✅ `controllers/payrollController.js` - No errors
- ✅ Migration file created

## Next Steps for Deployment

1. **Run Migration:**
   ```bash
   # Execute migration to add database columns
   node migrations/037_add_custom_period_dates_to_payroll_runs.js
   ```

2. **Deploy Backend Code:**
   - Deploy updated model files
   - Deploy updated controller file
   - Restart backend server

3. **Test Feature:**
   - Upload timesheet with date range A-B
   - Calculate payroll with custom dates C-D
   - Verify paystub shows C-D, not A-B
   - Verify GET /timesheet-periods shows custom date info

4. **Optional Frontend Updates:**
   - Add warning badges for custom date runs
   - Display custom date info in timesheet period list
   - Show "Custom Date Range" indicator on paystubs

## Support

For questions or issues:
1. Check `docs/custom-period-dates-tracking.md` for detailed documentation
2. Review testing checklist in documentation
3. Verify migration ran successfully
4. Check database columns exist and are populated correctly
