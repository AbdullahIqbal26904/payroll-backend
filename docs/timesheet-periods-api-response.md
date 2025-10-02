# Timesheet Periods API Response

## Endpoint
`GET /api/payroll/timesheet-periods`

## Description
Retrieves all timesheet periods with their status and related information.

## Query Parameters
- `limit` (optional, default: 10) - Number of records to return
- `page` (optional, default: 1) - Page number for pagination

## Response Format

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Timesheet periods retrieved successfully",
  "data": [
    {
      "id": 1,
      "report_title": "Punch Report",
      "period_start": "2025-09-15",
      "period_end": "2025-09-28",
      "status": "finalized",
      "created_at": "2025-09-29T10:30:00.000Z",
      "updated_at": "2025-09-30T14:22:00.000Z",
      "created_by": 1,
      "created_by_name": "Admin User",
      "entry_count": 150,
      "custom_date_runs_count": 2,
      "custom_date_runs_info": "Run #5 (2025-09-15 to 2025-09-21); Run #6 (2025-09-22 to 2025-09-28)",
      "hasCustomDateRuns": true,
      "customDateRunsCount": 2
    },
    {
      "id": 2,
      "report_title": "Punch Report",
      "period_start": "2025-09-01",
      "period_end": "2025-09-14",
      "status": "processed",
      "created_at": "2025-09-15T09:00:00.000Z",
      "updated_at": "2025-09-15T16:45:00.000Z",
      "created_by": 1,
      "created_by_name": "Admin User",
      "entry_count": 145,
      "custom_date_runs_count": 0,
      "custom_date_runs_info": null,
      "hasCustomDateRuns": false,
      "customDateRunsCount": 0
    },
    {
      "id": 3,
      "report_title": "Punch Report",
      "period_start": "2025-08-16",
      "period_end": "2025-08-31",
      "status": "pending",
      "created_at": "2025-09-01T08:00:00.000Z",
      "updated_at": "2025-09-01T08:00:00.000Z",
      "created_by": 1,
      "created_by_name": "Admin User",
      "entry_count": 152,
      "custom_date_runs_count": 0,
      "custom_date_runs_info": null,
      "hasCustomDateRuns": false,
      "customDateRunsCount": 0
    }
  ]
}
```

## Field Descriptions

### Core Fields (from timesheet_periods table)
- `id` (integer) - Unique identifier for the timesheet period
- `report_title` (string) - Title of the timesheet report
- `period_start` (date string) - Start date of the pay period (YYYY-MM-DD)
- `period_end` (date string) - End date of the pay period (YYYY-MM-DD)
- **`status`** (enum string) - Current status of the timesheet period
  - `"pending"` - Timesheet uploaded but payroll not yet calculated
  - `"processed"` - Payroll has been calculated for this period
  - `"finalized"` - Payroll has been finalized and locked
- `created_at` (datetime string) - When the timesheet period was created
- `updated_at` (datetime string) - When the timesheet period was last updated
- `created_by` (integer) - User ID who created the period

### Computed Fields
- `created_by_name` (string) - Name of the user who created the period
- `entry_count` (integer) - Total number of timesheet entries in this period
- `custom_date_runs_count` (integer) - Number of payroll runs using custom date ranges
- `custom_date_runs_info` (string|null) - Details about payroll runs with custom dates
- `hasCustomDateRuns` (boolean) - Whether any payroll runs used custom dates
- `customDateRunsCount` (integer) - Count of custom date runs (same as custom_date_runs_count)

## Status Lifecycle

```
┌─────────┐
│ pending │  ← Initial status when timesheet is uploaded
└────┬────┘
     │
     │ POST /api/payroll/calculate
     │
     ▼
┌───────────┐
│ processed │  ← Set when payroll is calculated
└─────┬─────┘
      │
      │ PATCH /api/payroll/reports/:id/status (status=finalized)
      │
      ▼
┌───────────┐
│ finalized │  ← Set when payroll is finalized
└───────────┘
```

## Notes
- The `status` field is automatically updated by the system when payroll operations occur
- Status transitions are logged in the console for audit purposes
- The `updated_at` timestamp changes whenever the status is updated
- Pagination is implemented using `limit` and `page` query parameters

## Related Endpoints
- `GET /api/payroll/timesheet-periods/:id` - Get a single timesheet period (also includes status)
- `POST /api/payroll/upload-timesheet` - Upload timesheet (creates period with status "pending")
- `POST /api/payroll/calculate` - Calculate payroll (updates status to "processed")
- `PATCH /api/payroll/reports/:id/status` - Finalize payroll (updates status to "finalized")

## Implementation Details
The status field is retrieved via the SQL query:
```sql
SELECT tp.*, u.name as created_by_name, ...
FROM timesheet_periods tp
LEFT JOIN users u ON tp.created_by = u.id
```

The `tp.*` selector includes all columns from `timesheet_periods`, including the `status` column.
