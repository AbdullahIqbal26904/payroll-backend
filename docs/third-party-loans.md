# Third-Party Loan Deductions

## Overview

This feature allows MSA to make payments to third-party institutions on behalf of employees. It's implemented as an extension of our existing loan system.

## Key Features

1. **Two Loan Types**: 
   - Internal loans (existing functionality)
   - Third-party loans (new functionality)

2. **Third-Party Loan Rules**:
   - Displayed as "Miscellaneous (Misc.) Deductions" on employee paystubs
   - Each staff member can only have one 3rd party loan at a time
   - MSA makes payments to external entities on behalf of employees (Credit Union, Car Loan, Land payment, etc.)

3. **Additional Data Captured**:
   - Third-party entity name
   - Account number
   - Routing number
   - Reference information

## Implementation Details

1. **Database Changes**:
   - Added `loan_type` column to `employee_loans` table
   - Added third-party payment details columns
   - Added tracking columns in payroll_items to distinguish between internal and third-party loan deductions

2. **API Endpoints**:
   - `/api/loans/third-party` - Create a third-party loan
   - `/api/loans/third-party-payments/:payrollRunId` - Get third-party payment data for a payroll run

3. **Business Logic**:
   - Enforced "one third-party loan per employee" rule
   - Separated internal and third-party loan deductions in payroll calculations
   - Prepared for ACH report generation (to be implemented later)

## Using the API

### Creating a Third-Party Loan

```
POST /api/loans/third-party

{
  "employee_id": 123,
  "loan_amount": 5000,
  "installment_amount": 250,
  "start_date": "2023-01-01",
  "expected_end_date": "2023-12-31",
  "third_party_name": "Credit Union XYZ",
  "third_party_account_number": "123456789",
  "third_party_routing_number": "987654321",
  "third_party_reference": "Loan #12345"
}
```

### Future ACH Report

A report for ACH transfers to third-party institutions will be implemented in the next phase. This will include:
- Payment details for all third-party deductions in a payroll period
- Required information for bank transfers
- Ability to generate the report for submission to MSA's bank
