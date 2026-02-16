# Employee Types and Compensation Rules

## Overview

The payroll system now supports two distinct employee types with different compensation rules:

1. **Salaried Employees**
   - Paid a flat monthly rate
   - Full salary is paid regardless of hours worked
   - Overtime is paid at 1.5x rate for hours over the standard
   - Overtime rate is calculated as: `(annual_salary / 52 weeks / 40 hours) * 1.5`

2. **Hourly Employees**
   - Paid based on hours worked multiplied by hourly rate
   - Straight pay with no overtime premium

## Technical Implementation

### Database Changes

Two migrations have been added:

1. `015_add_employee_type.js`: Adds `employee_type` and `standard_hours` fields to the employees table
2. `016_update_payroll_items_for_overtime.js`: Adds fields for tracking regular hours, overtime hours, and overtime amount

### Calculation Logic

The payroll calculation logic now differentiates between salaried and hourly employees:

- **Salaried Employees**:
  - Full salary is always paid for the period
  - Overtime is calculated for hours over the standard

- **Hourly Employees**:
  - Pay is calculated as hours worked multiplied by hourly rate
  - No overtime calculation is applied

### Paystub Display

Paystubs now show a breakdown of:
- Regular hours and earnings
- Overtime hours and earnings (for salaried employees with overtime)

## Usage

When creating or updating employees in the system:

1. Set the `employee_type` to either "salary" or "hourly"
2. For salaried employees, set the `salary_amount` field
3. For hourly employees, set the `hourly_rate` field
4. Optionally, adjust the `standard_hours` field (defaults to 40)

The payroll system will automatically apply the appropriate calculation rules based on the employee type.
