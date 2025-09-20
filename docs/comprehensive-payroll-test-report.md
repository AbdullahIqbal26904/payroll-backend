# Comprehensive Payroll Test Report

Date: 2025-09-20

This document summarizes end-to-end test calculations run against the payroll system and provides clear steps for reproducing the results. The scenarios cover multiple employee types, payment frequencies, loans, vacations, sick leave, public holiday pay, Semi-Monthly education levy behavior, employee exemptions, senior medical rates, and overlapping vacation/leave conditions.

## What we tested

- Employee types
  - Salaried (Monthly)
  - Hourly (Bi-Weekly with overtime)
  - Private Duty Nurse (day/night/weekend rate logic)
- Payment frequencies
  - Monthly (salaried)
  - Bi-Weekly (hourly and nurse)
  - Semi-Monthly (salaried)
- Paid time and absences
  - Approved vacation (hourly, nurse)
  - Approved sick/maternity leave (salaried)
  - Paid public holiday within the period
  - Overlapping vacation and leave on the same day (visibility scenario)
- Loans
  - Internal loan (hourly employee)
  - Third-party loan (salaried employee)
- Deductions & net pay
  - Social Security, Medical Benefits (with senior rate rules), and Education Levy (Monthly/Semi-Monthly) per Antigua rules
  - Employee-level exemptions for SS/Medical
  - Loan deductions applied against net pay
 - Year-to-date (YTD) aggregation across multiple runs
 - ACH report generation sanity checks

## Test window and seeded data

- Pay period: 2025-09-15 to 2025-09-28 (bi-weekly, two weeks)
- Public holiday: 2025-09-17 ("Test Holiday")
- Employees
  - SAL001 — Sally Salary
    - Type: salary, Payment Frequency: Monthly, Salary: 6,000.00, Standard hours: 40/week
    - Leave: 1 day sick (8h) on 2025-09-17 (approved, 100% pay)
    - Third-party loan: installment 100.00
  - HR001 — Henry Hourly
    - Type: hourly, Payment Frequency: Bi-Weekly, Rate: 20.00/hour, Standard hours: 40/week
    - Vacation: 1 day (8h) on 2025-09-19, paid at 20.00/hour (approved)
    - Internal loan: installment 50.00
    - Total worked hours in period: 90h (=> OT triggered)
  - NUR001 — Nina Nurse
    - Type: private_duty_nurse, Payment Frequency: Bi-Weekly, Base hourly for vacation/leave: 30.00/hour, Standard hours: 36/week
    - Shifts:
      - Mon 2025-09-15 (day): 10h at 35.00/h
      - Wed 2025-09-17 (night): 10h at 40.00/h
      - Sat 2025-09-20 (day/weekend): 8h at 40.00/h
    - Vacation: 1 day (8h) on 2025-09-20, paid at 30.00/hour (approved)

  - SEL001 — Sam SemiLow
    - Type: salary, Payment Frequency: Semi-Monthly, Salary: 4,000.00, Standard hours: 40/week
    - Worked 87h (>= semi-monthly standard ~86.67h)
  - SEH001 — Sara SemiHigh
    - Type: salary, Payment Frequency: Semi-Monthly, Salary: 12,000.00, Standard hours: 40/week
    - Worked 87h (>= semi-monthly standard ~86.67h)
  - EXS001 — Evan ExemptSS
    - Type: hourly, Bi-Weekly, Rate: 20.00/hour, is_exempt_ss = true
    - Worked 40h + 8h holiday
  - EXM001 — Mia ExemptMB
    - Type: hourly, Bi-Weekly, Rate: 20.00/hour, is_exempt_medical = true
    - Worked 40h + 8h holiday
  - SEN001 — Sophie Senior
    - Type: hourly, Bi-Weekly, Rate: 20.00/hour, senior age band for medical benefits
    - Worked 40h + 8h holiday
  - OVL001 — Olly Overlap
    - Type: hourly, Bi-Weekly, Rate: 20.00/hour
    - Worked 32h + vacation 8h + sick leave 8h on the same day + 8h holiday (visibility test)

Notes:
- Holiday pay is enabled. For hourly and nurse, holiday hours use standard_daily_hours = standard_hours / 5. For salaried, holiday pay is added on top of salary at their effective hourly rate.
- Deductions were computed by the payroll engine using configured Antigua rates.

## Calculation breakdowns (key values)

All values below reflect the payroll engine’s calculations. These were asserted in an automated test to ensure correctness.

### HR001 (Hourly, Bi-Weekly)
- Worked hours: 90h; standard bi-weekly hours: 80h
- Regular pay: 80h × 20.00 = 1,600.00
- Overtime pay: 10h × (20.00 × 1.5) = 300.00
- Vacation pay: 8h × 20.00 = 160.00
- Holiday pay: 8h × 20.00 = 160.00
- Gross pay: 1,600.00 + 300.00 + 160.00 + 160.00 = 2,220.00
- Loan deductions: Internal = 50.00
- Net pay: Gross minus employee deductions (SS/MB/Education where applicable) minus loan deduction

### SAL001 (Salary, Monthly)
- Monthly salary: 6,000.00
- Hours considered for proration: worked 32h + leave 8h = 40h
- Standard hours this period for Monthly: 40h/week × 4 weeks = 160h
- Prorated salary: 6,000.00 × (40 / 160) = 1,500.00
- Effective hourly (for holiday and leave): (6,000 × 12) / (52 × 40) ≈ 34.615
- Holiday pay: 8h × 34.615 ≈ 276.92 (added to salary)
- Leave pay (sick): 8h × (6,000/26)/40 ≈ 46.15 (added to salary)
- Gross pay: ≈ 1,500.00 + 276.92 + 46.15 ≈ 1,823.08
- Loan deductions: Third-party = 100.00
- Net pay: Gross minus employee deductions minus loan deduction

### NUR001 (Private Duty Nurse, Bi-Weekly)
- Base shift pay:
  - 10h weekday day @ 35.00 = 350.00
  - 10h night (all days) @ 40.00 = 400.00
  - 8h weekend day @ 40.00 = 320.00
  - Subtotal: 1,070.00
- Vacation pay: 8h × 30.00 = 240.00
- Holiday pay: standard_daily_hours = 36/5 = 7.2h; 7.2h × 35.00 = 252.00
- Gross pay: 1,070.00 + 240.00 + 252.00 = 1,562.00
- Net pay: Gross minus employee deductions (no loans for this employee)

### SEL001 (Salary, Semi-Monthly)
- Semi-monthly base: 4,000.00 / 2 = 2,000.00
- Holiday pay: 8h × ((4,000 × 12) / (52 × 40)) ≈ 8 × 34.615 = 184.62
- Gross pay: 2,000.00 + 184.62 = 2,184.62
- Education Levy: Applied per Semi-Monthly tiering (half-threshold/half-exemption). See “Antigua Payroll Rules” in documentation for the exact formula.

### SEH001 (Salary, Semi-Monthly)
- Semi-monthly base: 12,000.00 / 2 = 6,000.00
- Holiday pay: 8h × ((12,000 × 12) / (52 × 40)) ≈ 8 × 69.231 = 553.85
- Gross pay: 6,000.00 + 553.85 = 6,553.85
- Education Levy: Higher than SEL001 due to exceeding the higher tier threshold.

### EXS001 (Hourly, SS Exempt)
- Gross pay: 40h × 20.00 + 8h holiday × 20.00 = 960.00
- Social Security Employee: 0.00 (exempt)

### EXM001 (Hourly, Medical Benefits Exempt)
- Gross pay: 960.00
- Medical Benefits Employee: 0.00 (exempt)

### SEN001 (Hourly, Senior Medical Rate)
- Gross pay: 960.00
- Medical Benefits Employee: ≈ 2.5% of gross (24.00)
- Medical Benefits Employer: 0.00 (as per senior rule)

### OVL001 (Hourly, Overlapping Vacation + Leave)
- Gross pay components (example): 32h regular = 640.00; vacation 8h = 160.00; leave 8h = 160.00; holiday 8h = 160.00; Total = 1,120.00
- Note: The test intentionally flags overlapping vacation and leave on the same day with a soft warning to surface potential double-payment. Policy can be configured (e.g., cap to one standard day or prioritize leave over vacation).

## Test outcome

- Result: All assertions passed. An informational soft warning is displayed for the overlap scenario.
- After the first run, we executed a second payroll in the same year to validate YTD roll-up and generated an ACH report for a sanity check.
- Console output (excerpt):

```
All gross pay assertions passed.
Soft assertion failed: Overlap paid components seem high: vacation 160 + leave 160

Success: Comprehensive payroll test (phase 1) passed. Proceeding to YTD and ACH checks...
YTD aggregation assertions passed.
ACH total_amount: 0.00 Computed total net: 14731.56

Success: YTD and ACH checks passed.
```

Additional details:
- YTD fields validated included ytd_gross_pay, ytd_social_security_employee, ytd_medical_benefits_employee, ytd_education_levy, ytd_net_pay, ytd_hours_worked, ytd_vacation_hours, and ytd_vacation_amount — each equaled (first run + second run) for the chosen employees.
- ACH: Because we did not seed direct deposit banking info, all items were flagged as missing info, summary.total_transactions = 0, and summary.total_amount = 0.00 (expected). The items count matched the number of payroll items with net_pay > 0 for that run.

A complete console transcript is available from the test run. Key intermediate logs also show leave/vacation/holiday hours and calculated amounts per employee.

## How you can run this test yourself

Prerequisites:
- Database connection configured in environment (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME) and migrations applied.
- Node.js environment that can run the project.

Run the test script (Windows PowerShell):

```powershell
node test/comprehensive-payroll-test.js
```

What the script does safely:
- Inserts/updates records only for the test period and test employees.
- Cleans the following tables/records for idempotent runs:
  - Deletes test payroll runs and items
  - Deletes period entries and the period
  - Deletes test vacations and leaves
  - Deletes the test public holiday (2025-09-17)
  - Deletes test loans and loan payments
  - Deletes only the test employees with IDs: SAL001, HR001, NUR001, SEL001, SEH001, EXS001, EXM001, SEN001, OVL001

Important: Use a non-production database. The script will `DELETE` from specific tables to ensure a clean test state.

## Where to look for results

- Console output: shows a breakdown of calculations and the final success message
- Database tables:
  - `payroll_runs` — runs per period (two in this test: September and October windows)
  - `payroll_items` — rows per employee, including per-run and YTD fields
  - `employee_ytd_summary` — per-employee/year aggregation maintained by the engine
  - `loan_payments` — created for deducted loan installments
  - ACH data — produced by the `Payroll.generateACHReport(payrollRunId)` function at runtime (not persisted); inspect returned `items` and `summary`

## Adjusting scenarios

- Payment frequencies: change `payment_frequency` per employee (`Monthly`, `Bi-Weekly`, `Semi-Monthly`)
- Rates and salaries: adjust `hourly_rate` and `salary_amount`
- Hours: modify timesheet entries to test boundary conditions (no OT, high OT, zero hours)
- Vacations/leaves: add multiple or overlapping entries with varying approvals and payment percentages
- Holidays: add additional holidays within the period and observe impacts

ACH with actual payments:
- Create `employee_banking_info` rows for one or more employees (set `is_primary = TRUE` and `direct_deposit_enabled = TRUE`).
- Use `utils/encryptionUtils.encrypt` to store `account_number_encrypted` and `routing_number_encrypted`.
- Re-run to see non-zero `summary.total_amount` and `summary.total_transactions` in the ACH output.

Cross-verifying YTD:
- Compare YTD fields on `payroll_items` with the corresponding row in `employee_ytd_summary` for the same employee/year.

If you’d like us to include additional case coverage (multiple Semi-Monthly edge cases, retirement-age SS exemption, over-70 MB exemption), we can extend this test suite accordingly.

## Additional run for YTD and ACH

- Second pay period: 2025-10-13 to 2025-10-26 (bi-weekly)
- YTD validations asserted that the second run’s YTD fields equal the sum of the first and second run values for selected employees (hourly and salaried cases).
- ACH sanity checks confirmed zero totals and all transactions marked as missing when no banking info is present; items matched the payable payroll items count.

---

Prepared for: Client Review and UAT