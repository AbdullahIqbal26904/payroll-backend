# Private Duty Nurse Employee Type

This document outlines the implementation details for the Private Duty Nurse employee type in the MSA Payroll System.

## Overview

Private Duty Nurses are paid on a straight hourly basis with no overtime eligibility. Their pay is determined by:
1. The time of day they work (day shift vs night shift)
2. The day of the week (weekday vs weekend)

## Pay Rates

Private Duty Nurses are paid according to the following schedule:

| Shift                            | Rate per Hour |
|----------------------------------|--------------|
| Day Shift (7:00am - 7:00pm) - Monday to Friday | $35.00 |
| Night Shift (7:00pm - 7:00am) - All days | $40.00 |
| Day Shift (7:00am - 7:00pm) - Saturday and Sunday | $40.00 |

## Implementation Details

### Database Schema
- The `employee_type` ENUM in the `employees` table has been expanded to include 'private_duty_nurse' as a valid option
- No specific hourly rate is stored for these employees as rates are determined by shift

### Payroll Calculation
When processing payroll for Private Duty Nurses:
1. Each timesheet entry is analyzed individually
2. The system checks the day of the week from the entry date
3. The system determines the shift based on the time_in field
4. The appropriate hourly rate is applied based on the shift and day
5. No overtime calculations are performed regardless of hours worked

### Timesheet Entries
For accurate pay calculation, timesheet entries for Private Duty Nurses must include:
- Accurate work_date - used to determine the day of the week
- Accurate time_in - used to determine the shift (day vs night)
- Accurate total_hours - used to calculate total pay

## Future Enhancements
Potential future enhancements for the Private Duty Nurse feature:
- Support for holiday pay at premium rates
- Shift differential for partial shifts that cross between day and night
- Custom rate overrides for specific employees or situations
