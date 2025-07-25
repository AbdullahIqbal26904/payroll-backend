# Public Holidays Management

This document outlines the implementation of the paid public holidays system in the MSA Payroll System.

## Overview

The system allows administrators to:
1. Add, edit, and delete public holidays
2. Enable or disable automatic payment for public holidays
3. View all holidays and filter by year or date range

When processing payroll, any public holidays falling within a timesheet period are automatically calculated and included in the employee's gross pay.

## Holiday Types

The system supports various types of public holidays in Antigua, including:

- **Fixed Date Holidays**: These occur on the same date each year
  - New Year's Day (January 1st)
  - V.C Bird Day (December 9th)
  - Christmas Day (December 25th)
  - Boxing Day (December 26th)

- **Variable Date Holidays**: These occur on different dates each year
  - Good Friday
  - Easter Monday
  - Whit Monday

- **Rule-Based Holidays**: These follow specific rules for when they occur
  - Labour Day (First Monday in May)
  - Carnival Monday (First Monday in August)
  - Carnival Tuesday (First Tuesday in August)
  - Independence Day (Date varies in observation)

## How to Add Holidays

Administrators can add holidays through the API or management interface:

1. Navigate to the Public Holidays section in the admin panel
2. Click "Add New Holiday"
3. Enter the holiday name, date, and optional description
4. Submit to add the holiday

## Payroll Calculation with Holidays

When calculating payroll:

1. The system first checks if holiday pay is enabled (default: enabled)
2. It then looks for any holidays that fall within the payroll period
3. For each holiday, it adds the appropriate hours and pay based on:
   - For hourly employees: Standard daily hours (typically 8) × hourly rate
   - For salaried employees: Hourly equivalent of salary × standard daily hours
   - For private duty nurses: Base rate × standard daily hours

## Holiday Pay Rules

- All regular full-time employees are entitled to paid public holidays
- Part-time employees receive pro-rated holiday pay based on their standard hours
- Holiday hours do not count as overtime-eligible hours
- Holiday pay is subject to the same tax and deduction calculations as regular pay

## API Endpoints

The system provides the following API endpoints for holiday management:

- `POST /api/holidays` - Add a new public holiday
- `PUT /api/holidays/:id` - Update an existing holiday
- `DELETE /api/holidays/:id` - Delete a holiday
- `GET /api/holidays` - Get all holidays (with optional filtering)
- `GET /api/holidays/:id` - Get a specific holiday
- `GET /api/holidays/range` - Get holidays within a date range
- `GET /api/holidays/settings` - Get holiday pay settings
- `PUT /api/holidays/settings` - Update holiday pay settings

## Database Structure

The holidays are stored in the `public_holidays` table with the following structure:

- `id` - Unique identifier
- `name` - Holiday name
- `date` - Holiday date
- `year` - Year of the holiday (for easier querying)
- `description` - Optional description
- `created_by` - User ID who created the holiday
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

## Examples

### Adding a Fixed Holiday

```javascript
// Add Christmas Day
await PublicHoliday.addHoliday({
  name: 'Christmas Day',
  date: '2023-12-25',
  description: 'Christmas Day celebration'
}, userId);
```

### Adding a Variable Holiday

```javascript
// Add Good Friday for 2023
await PublicHoliday.addHoliday({
  name: 'Good Friday',
  date: '2023-04-07', // Date for 2023
  description: 'Good Friday'
}, userId);
```

## Best Practices

1. Add holidays at the beginning of each year or fiscal period
2. Double-check variable holiday dates before adding them
3. Consider using a holiday calendar API to automate adding variable holidays
4. Verify holiday calculations in test payrolls before finalizing actual payroll runs
