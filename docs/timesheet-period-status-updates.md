# Timesheet Period Status Updates

## Overview
This document describes the automatic status update functionality for the `timesheet_periods` table when payroll is calculated or finalized.

## Implementation Date
October 2, 2025

## Status Flow
The `timesheet_periods` table has three status values:
1. **`pending`** - Initial status when timesheet is uploaded
2. **`processed`** - Set when payroll is calculated for the period
3. **`finalized`** - Set when the payroll run is finalized

## Changes Made

### 1. Timesheet Model (`models/Timesheet.js`)
Added a new method `updatePeriodStatus()` to update the status of a timesheet period:

```javascript
/**
 * Update timesheet period status
 * @param {number} periodId - Period ID
 * @param {string} status - New status ('pending', 'processed', 'finalized')
 * @returns {Promise<Object>} Updated period
 */
static async updatePeriodStatus(periodId, status)
```

**Features:**
- Validates that the status is one of the allowed values
- Updates the `status` and `updated_at` fields
- Returns the updated period data
- Includes error handling with logging

### 2. Payroll Model (`models/Payroll.js`)

#### Added Import
```javascript
const Timesheet = require('./Timesheet');
```

#### Updated `calculateForPeriod()` Method
After successful payroll calculation (after `connection.commit()`), the method now:
- Automatically updates the timesheet period status to `'processed'`
- Logs the status update
- Handles errors gracefully without failing the entire payroll calculation

**Location:** After line where `connection.commit()` is called

```javascript
// Update timesheet period status to 'processed' after successful payroll calculation
try {
  await Timesheet.updatePeriodStatus(periodId, 'processed');
  console.log(`Timesheet period ${periodId} status updated to 'processed'`);
} catch (statusError) {
  console.error('Error updating timesheet period status:', statusError);
  // Don't fail the entire operation if status update fails
}
```

#### Updated `updatePayrollStatus()` Method
When a payroll run is finalized, the method now:
- Automatically updates the timesheet period status to `'finalized'`
- Logs the status update
- Handles errors gracefully without failing the finalization

**Location:** After successfully updating the payroll run status

```javascript
// Update timesheet period status to 'finalized' when payroll is finalized
if (newStatus === 'finalized' && updatedRun.period_id) {
  try {
    await Timesheet.updatePeriodStatus(updatedRun.period_id, 'finalized');
    console.log(`Timesheet period ${updatedRun.period_id} status updated to 'finalized'`);
  } catch (statusError) {
    console.error('Error updating timesheet period status:', statusError);
    // Don't fail the entire operation if status update fails
  }
}
```

## Behavior

### When Timesheet is Uploaded
- Status: **`pending`** (default)
- No changes made to existing upload logic

### When Payroll is Calculated
- The `POST /api/payroll/calculate` endpoint triggers `Payroll.calculateForPeriod()`
- After successful calculation and database commit:
  - Timesheet period status automatically changes from `pending` → **`processed`**
  - Status update is logged to console
  - If status update fails, error is logged but payroll calculation is not rolled back

### When Payroll is Finalized
- The `PATCH /api/payroll/reports/:id/status` endpoint triggers `Payroll.updatePayrollStatus()`
- After successfully setting payroll run status to 'finalized':
  - Timesheet period status automatically changes from `processed` → **`finalized`**
  - Status update is logged to console
  - If status update fails, error is logged but payroll finalization is not rolled back

## Error Handling
Both status update operations include try-catch blocks that:
1. Log errors to the console
2. Do NOT fail the parent operation (payroll calculation or finalization)
3. Allow the payroll operations to complete successfully even if status update fails

This ensures that a failure in updating the timesheet period status won't prevent payroll from being processed or finalized.

## Database Schema
The existing `timesheet_periods` table already includes:
```sql
status ENUM('pending', 'processed', 'finalized') DEFAULT 'pending'
```

No migration is needed as the status column already exists.

## Testing Recommendations

### Test Case 1: Calculate Payroll
1. Upload a timesheet (status should be `pending`)
2. Calculate payroll for the period
3. Verify timesheet period status changes to `processed`
4. Check console logs for confirmation message

### Test Case 2: Finalize Payroll
1. Have a payroll run with status `completed`
2. Finalize the payroll run
3. Verify timesheet period status changes to `finalized`
4. Check console logs for confirmation message

### Test Case 3: Multiple Calculations
1. Upload a timesheet
2. Calculate payroll (status → `processed`)
3. Calculate payroll again with custom dates
4. Verify status remains `processed` (not reset to `pending`)

### Test Case 4: Error Handling
1. Verify that if the status update fails, the payroll operation still completes
2. Check error logs for appropriate error messages

## API Endpoints Affected
- `POST /api/payroll/calculate` - Now updates timesheet period status to 'processed'
- `PATCH /api/payroll/reports/:id/status` - Now updates timesheet period status to 'finalized'

## Notes
- The status update happens **after** the payroll operation commits to the database
- Status updates are non-blocking and won't prevent payroll operations from completing
- All status transitions are logged for debugging and audit purposes
- The `updated_at` timestamp is automatically updated when status changes
