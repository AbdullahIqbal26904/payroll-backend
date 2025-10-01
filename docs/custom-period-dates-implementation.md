# Custom Pay Period Dates Implementation

## Overview
This implementation allows you to upload a timesheet CSV containing entries for a full month (e.g., Oct 1-30) and then flexibly define different pay periods from that data (e.g., Oct 1-25, Oct 26-30) without re-uploading the CSV.

## How It Works

### The Problem (Before)
- Upload CSV with Oct 1-30 entries
- System would process ALL 30 days when calculating payroll
- No way to split the month into multiple pay periods

### The Solution (After)
- Upload CSV with Oct 1-30 entries → All entries stored in database
- Define pay period dates separately (Oct 1-25) → Only those dates are processed
- Later, define another period (Oct 26-30) → Those dates are now processed
- Same CSV data is reused for multiple pay periods

## Backend Changes

### 1. Enhanced API: Calculate Payroll with Custom Dates

**Endpoint:** `POST /api/payroll/calculate`

**New Request Body:**
```json
{
  "periodId": 123,
  "payDate": "2025-10-28",
  "periodStart": "2025-10-01",  // NEW: Optional custom start date
  "periodEnd": "2025-10-25"     // NEW: Optional custom end date
}
```

**Behavior:**
- If `periodStart` and `periodEnd` are provided → Uses these custom dates
- If NOT provided → Uses the dates stored in `timesheet_periods` table
- The system will only process timesheet entries where `work_date` is between the specified dates

**Response:** (unchanged)
```json
{
  "success": true,
  "message": "Payroll calculated successfully",
  "data": {
    "payrollRunId": 456,
    "periodId": 123,
    "totalEmployees": 50,
    "payrollItems": [...],
    "errors": null
  }
}
```

### 2. New API: Update Period Dates in Database

**Endpoint:** `PUT /api/payroll/timesheet-periods/:id/dates`

**Request Body:**
```json
{
  "periodStart": "2025-10-01",
  "periodEnd": "2025-10-25"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Period dates updated successfully",
  "data": {
    "id": 123,
    "report_title": "Punch Report",
    "period_start": "2025-10-01",
    "period_end": "2025-10-25",
    "created_at": "2025-10-01T10:00:00.000Z",
    "updated_at": "2025-10-15T14:30:00.000Z"
  }
}
```

**Validation:**
- Both dates are required
- Dates must be valid (YYYY-MM-DD format)
- Start date must be before or equal to end date
- Period must exist in database

## Frontend Implementation

### Approach 1: Pass Custom Dates Directly (Recommended)

This approach allows users to override dates per calculation without modifying the database.

```javascript
// PayrollCalculation.jsx
import React, { useState } from 'react';

const PayrollCalculation = ({ period }) => {
  const [periodStart, setPeriodStart] = useState(period.period_start);
  const [periodEnd, setPeriodEnd] = useState(period.period_end);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCalculate = async () => {
    try {
      const response = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          periodId: period.id,
          periodStart,    // Custom start date
          periodEnd,      // Custom end date
          payDate
        })
      });

      const result = await response.json();
      
      if (result.success) {
        alert('Payroll calculated successfully!');
        // Handle success - redirect to payroll report, etc.
      } else {
        alert(`Error: ${result.message}`);
      }
    } catch (error) {
      console.error('Error calculating payroll:', error);
      alert('Failed to calculate payroll');
    }
  };

  return (
    <div className="payroll-calculation">
      <h3>Calculate Payroll for Period: {period.report_title}</h3>
      
      <div className="info-box">
        <p><strong>CSV Contains:</strong> {period.period_start} to {period.period_end}</p>
        <p className="note">All timesheet entries from the CSV are available</p>
      </div>

      <div className="date-selection">
        <h4>Select Pay Period Dates</h4>
        <p className="help-text">
          Choose which date range to process from the uploaded timesheet
        </p>
        
        <div className="form-group">
          <label htmlFor="periodStart">Period Start Date:</label>
          <input
            id="periodStart"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            min={period.period_start}
            max={period.period_end}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="periodEnd">Period End Date:</label>
          <input
            id="periodEnd"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            min={periodStart}
            max={period.period_end}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label htmlFor="payDate">Pay Date:</label>
          <input
            id="payDate"
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="form-control"
          />
        </div>

        <div className="summary">
          <p><strong>Will Process:</strong> {periodStart} to {periodEnd}</p>
          <p><strong>Pay Date:</strong> {payDate}</p>
        </div>

        <button 
          onClick={handleCalculate}
          className="btn btn-primary"
        >
          Calculate Payroll ({periodStart} to {periodEnd})
        </button>
      </div>
    </div>
  );
};

export default PayrollCalculation;
```

### Approach 2: Update Database First, Then Calculate

This approach updates the period in the database before calculating.

```javascript
// PayrollCalculation.jsx (Alternative)
import React, { useState } from 'react';

const PayrollCalculation = ({ period, onPeriodUpdated }) => {
  const [periodStart, setPeriodStart] = useState(period.period_start);
  const [periodEnd, setPeriodEnd] = useState(period.period_end);
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const handleUpdateAndCalculate = async () => {
    setLoading(true);
    
    try {
      // Step 1: Update the period dates in the database
      const updateResponse = await fetch(`/api/payroll/timesheet-periods/${period.id}/dates`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          periodStart,
          periodEnd
        })
      });

      const updateResult = await updateResponse.json();
      
      if (!updateResult.success) {
        throw new Error(updateResult.message || 'Failed to update period dates');
      }

      // Notify parent component that period was updated
      if (onPeriodUpdated) {
        onPeriodUpdated(updateResult.data);
      }

      // Step 2: Calculate payroll with the updated dates
      const calcResponse = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          periodId: period.id,
          payDate
          // No need to send periodStart/periodEnd - they're now in the DB
        })
      });

      const calcResult = await calcResponse.json();
      
      if (calcResult.success) {
        alert('Payroll calculated successfully!');
        // Handle success
      } else {
        alert(`Error calculating payroll: ${calcResult.message}`);
      }
    } catch (error) {
      console.error('Error:', error);
      alert(`Failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payroll-calculation">
      <h3>Calculate Payroll for Period: {period.report_title}</h3>
      
      {/* Same form fields as Approach 1 */}
      
      <button 
        onClick={handleUpdateAndCalculate}
        disabled={loading}
        className="btn btn-primary"
      >
        {loading ? 'Processing...' : `Update & Calculate (${periodStart} to ${periodEnd})`}
      </button>
    </div>
  );
};

export default PayrollCalculation;
```

## Usage Examples

### Example 1: Single Month, Split into Two Periods

**Step 1: Upload CSV**
```
Upload: timesheet_october.csv (contains Oct 1-30 entries)
Result: Period ID 123 created with period_start=2025-10-01, period_end=2025-10-30
```

**Step 2: Calculate First Pay Period**
```javascript
// Frontend makes API call
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2025-10-01",
  "periodEnd": "2025-10-25",
  "payDate": "2025-10-28"
}

// Backend processes only Oct 1-25 entries
// Creates payroll run with 25 days of data
```

**Step 3: Calculate Second Pay Period**
```javascript
// Frontend makes API call (same period ID!)
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2025-10-26",
  "periodEnd": "2025-10-30",
  "payDate": "2025-11-05"
}

// Backend processes only Oct 26-30 entries
// Creates separate payroll run with 5 days of data
```

### Example 2: Using Default Dates

If you don't need custom dates, the system works as before:

```javascript
// Just pass periodId and payDate
POST /api/payroll/calculate
{
  "periodId": 123,
  "payDate": "2025-10-28"
}

// Uses period_start and period_end from database
// Processes all entries in the period
```

### Example 3: Update Period Dates Permanently

```javascript
// Update the period in the database
PUT /api/payroll/timesheet-periods/123/dates
{
  "periodStart": "2025-10-01",
  "periodEnd": "2025-15"
}

// Then calculate without custom dates
POST /api/payroll/calculate
{
  "periodId": 123,
  "payDate": "2025-10-18"
}

// Uses the updated dates from the database
```

## Database Schema

The `timesheet_periods` table already has the necessary columns:
- `id` - Primary key
- `report_title` - Name of the period
- `period_start` - Start date of the period
- `period_end` - End date of the period
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

The `timesheet_entries` table has:
- `id` - Primary key
- `period_id` - Foreign key to timesheet_periods
- `employee_id` - Employee identifier
- `work_date` - The date of work (THIS IS WHAT WE FILTER ON)
- Other fields...

## Key Benefits

1. **Flexibility:** Upload once, calculate multiple times with different date ranges
2. **No Re-uploads:** Reuse the same CSV data for different pay periods
3. **Backward Compatible:** Works with existing code that doesn't pass custom dates
4. **Data Integrity:** Original CSV data remains unchanged
5. **Audit Trail:** Each payroll run stores which dates were actually processed

## Testing Checklist

### Backend Tests
- [ ] Calculate with custom dates (periodStart + periodEnd provided)
- [ ] Calculate without custom dates (uses database defaults)
- [ ] Calculate with only periodStart (should fail or use default)
- [ ] Calculate with only periodEnd (should fail or use default)
- [ ] Update period dates with valid dates
- [ ] Update period dates with invalid dates (should fail)
- [ ] Update period dates with start > end (should fail)
- [ ] Update non-existent period (should fail with 404)

### Frontend Tests
- [ ] Display original CSV date range
- [ ] Allow user to select custom date range
- [ ] Validate custom dates are within CSV range
- [ ] Show preview of what will be processed
- [ ] Calculate payroll with custom dates
- [ ] Calculate payroll with default dates
- [ ] Handle API errors gracefully
- [ ] Update period dates in database
- [ ] Refresh period data after update

### Integration Tests
- [ ] Upload CSV Oct 1-30
- [ ] Calculate Oct 1-25 → Verify 25 days processed
- [ ] Calculate Oct 26-30 → Verify 5 days processed
- [ ] Verify no overlap in payroll runs
- [ ] Verify totals are correct
- [ ] Verify vacation/leave/holidays calculated correctly for custom dates

## Migration Guide

### For Existing Systems

If you're upgrading an existing system:

1. **No database changes needed** - The schema already supports this
2. **Frontend changes optional** - Old code continues to work
3. **Gradual rollout** - Add custom date UI gradually

### For New Implementations

1. Implement the frontend UI with custom date selection
2. Add validation to ensure dates are within available data
3. Show users which dates will be processed before calculation
4. Add tooltips/help text to explain the feature

## Troubleshooting

### Issue: No entries found for custom date range
**Cause:** Custom dates are outside the range of uploaded timesheet data  
**Solution:** Check the original period dates and ensure custom dates are within that range

### Issue: Vacation/leave not calculated correctly
**Cause:** Vacation/leave tables might have entries outside the custom date range  
**Solution:** The system already handles this - vacation/leave are calculated only for the custom date range

### Issue: YTD totals seem incorrect
**Cause:** Multiple payroll runs for overlapping periods  
**Solution:** Ensure pay periods don't overlap. Use non-overlapping custom dates.

## Console Logs for Debugging

The backend now logs which dates are being used:

```
Payroll calculation for period 123:
  - CSV/Period dates: 2025-10-01 to 2025-10-30
  - Using dates: 2025-10-01 to 2025-10-25
  - Custom dates provided: Using custom range for calculation
Found 500 timesheet entries between 2025-10-01 and 2025-10-25
```

## Support

For questions or issues:
1. Check the console logs for date range being used
2. Verify timesheet entries exist for the selected date range
3. Ensure period exists in database before calculating
4. Review the API response for detailed error messages
