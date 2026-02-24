# Employee Types and Compensation Rules

## Overview

The payroll system supports four distinct employee types with different compensation rules:

1. **Salaried Employees**
   - Paid a flat monthly rate
   - Full salary is paid regardless of hours worked
   - Overtime is paid at 1.5x rate for hours over the standard
   - Overtime rate is calculated as: `(annual_salary / 52 weeks / 40 hours) * 1.5`

2. **Hourly Employees**
   - Paid based on hours worked multiplied by hourly rate
   - Straight pay with no overtime premium

3. **Private Duty Nurse**
   - Shift-based pay rates (weekday day, weekend day, night)
   - No overtime calculation
   - Eligible for vacation, leave, and holiday pay

4. **Supervisor**
   - Salaried (paid a flat monthly rate like salaried employees)
   - Does **not** receive overtime pay
   - Does **not** receive vacation pay
   - Does **not** receive holiday pay
   - Sick/maternity leave still applies

## Technical Implementation

### Database Changes

Two migrations have been added:

1. `015_add_employee_type.js`: Adds `employee_type` and `standard_hours` fields to the employees table
2. `016_update_payroll_items_for_overtime.js`: Adds fields for tracking regular hours, overtime hours, and overtime amount

### Calculation Logic

The payroll calculation logic differentiates between employee types:

- **Salaried Employees**:
  - Full salary is always paid for the period
  - Overtime is calculated for hours over the standard

- **Hourly Employees**:
  - Pay is calculated as hours worked multiplied by hourly rate
  - No overtime calculation is applied

- **Supervisor**:
  - Full salary is always paid for the period (same as salaried)
  - No overtime, vacation pay, or holiday pay
  - Sick/maternity leave still applies

### Paystub Display

Paystubs now show a breakdown of:
- Regular hours and earnings
- Overtime hours and earnings (for salaried employees with overtime)

## Usage

When creating or updating employees in the system:

1. Set the `employee_type` to "salary", "hourly", "private_duty_nurse", or "supervisor"
2. For salaried employees and supervisors, set the `salary_amount` field
3. For hourly employees, set the `hourly_rate` field
4. Optionally, adjust the `standard_hours` field (defaults to 40)
5. Supervisors are salaried but excluded from overtime, vacation pay, and holiday pay

The payroll system will automatically apply the appropriate calculation rules based on the employee type.
