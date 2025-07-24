# Payroll System API Updates - July 2025

## Database Schema Updates

Multiple new migrations have been added to update the database schema:

1. **010_update_employees_table.js**: Adds the following columns to the employees table:
   - `hourly_rate`: DECIMAL(10,2) - Hourly rate for the employee
   - `is_exempt_ss`: BOOLEAN - Flag to indicate exemption from Social Security
   - `is_exempt_medical`: BOOLEAN - Flag to indicate exemption from Medical Benefits
   - `email`: VARCHAR(100) - Employee email address

2. **011_update_payroll_items.js**: Adds the following column to the payroll_items table:
   - `total_employer_contributions`: DECIMAL(10,2) - Sum of all employer contributions

3. **021_add_vacation_entitlement.js**: Creates the employee_vacations table and adds vacation-related columns to the payroll_items and ytd_summary tables:
   - `vacation_hours`: DECIMAL(10,2) - Vacation hours taken in the pay period
   - `vacation_amount`: DECIMAL(10,2) - Vacation pay amount for the pay period
   - `ytd_vacation_hours`: DECIMAL(10,2) - Year-to-date vacation hours
   - `ytd_vacation_amount`: DECIMAL(10,2) - Year-to-date vacation pay

## Payroll Calculation Logic Updates

The payroll calculation logic has been updated to:

1. Use hourly rate for bi-weekly payment calculation instead of approximating from salary
2. Use the correct database field names for exemption flags (`is_exempt_ss` and `is_exempt_medical`)
3. Calculate and store total employer contributions separately
4. Include vacation hours and pay in payroll calculations
5. Track vacation hours separately from regular worked hours
6. Apply vacation pay based on employee type:
   - Hourly employees: Vacation hours × Hourly rate
   - Salaried employees: Track vacation hours but pay is included in salary
   - Private duty nurses: Vacation hours × Hourly rate

## Key Rules for Payroll Calculations

The system calculates:

### Social Security
- Employee: 7% of gross pay (up to cap)
- Employer: 9% of gross pay (up to cap)
- Monthly cap: $6,500 (prorated for bi-weekly)
- Exemptions: Age 65+ or manually exempted

### Medical Benefits
- Regular employees (age < 60):
  - Employee: 3.5%
  - Employer: 3.5%
- Senior employees (age 60-70):
  - Employee: 2.5%
  - Employer: 0%
- Exemptions: Age 70+ or manually exempted

### Education Levy (Monthly payments only)
- For salaries ≤ $5,000: (gross - $541.67) * 2.5%
- For salaries > $5,000: [(5000 - $541.67) * 2.5%] + [(gross - 5000) * 5%]

## API Documentation

### Employee Management

The employee management API now supports the following additional fields:

```json
{
  "hourly_rate": 15.75,
  "is_exempt_ss": false,
  "is_exempt_medical": false,
  "email": "employee@example.com"
}
```

### Payroll Calculation Outputs

The payroll calculation API now includes employer contributions in its output:

```json
{
  "payrollRunId": 123,
  "periodId": 45,
  "payDate": "2025-06-30",
  "totalEmployees": 10,
  "payrollItems": [
    {
      "id": 1,
      "employeeId": "EMP101",
      "employeeName": "John Doe",
      "hoursWorked": 80,
      "grossPay": 1200.00,
      "socialSecurityEmployee": 84.00,
      "socialSecurityEmployer": 108.00,
      "medicalBenefitsEmployee": 42.00,
      "medicalBenefitsEmployer": 42.00,
      "educationLevy": 0.00,
      "totalDeductions": 126.00,
      "totalEmployerContributions": 150.00,
      "netPay": 1074.00
    }
  ]
}
```

## Implementation Notes

1. To run the migrations, use the migration script:
   ```
   ./migrations/migrate.sh
   ```

2. When creating new employees, be sure to provide the hourly rate for accurate bi-weekly calculations.

3. For existing employees, you may need to update their records with hourly rates if they are paid bi-weekly.
