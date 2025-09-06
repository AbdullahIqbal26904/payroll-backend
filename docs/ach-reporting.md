# ACH Reporting

## Overview

The ACH (Automated Clearing House) reporting system allows administrators to generate bank-focused reports for direct deposit payments. This feature enables easy integration with banking systems for processing payroll direct deposits.

## ACH Report Format

The ACH report follows this structure:

1. **Routing Number** - The bank routing number for the employee's account
2. **Account Number** - The employee's bank account number
3. **Account Type** - Whether the account is "Checking" or "Savings"
4. **Name** - The employee's full name
5. **Institute** - The name of the financial institution
6. **Amount** - The net pay amount to be deposited
7. **Credit** - Indicator that this is a credit transaction

## API Endpoint

### Get ACH Report

```
GET /api/payroll/ach-report/:id
```

**Parameters:**
- `id` (required) - The payroll run ID to generate the ACH report for
- `format` (optional) - Response format, options: 'json' or 'csv' (default: 'csv')

**Response:**
- For CSV format: A downloadable CSV file with the ACH data
- For JSON format: A JSON object containing the ACH data with masked account numbers for security

**JSON Response Example:**
```json
{
  "success": true,
  "message": "ACH report generated successfully",
  "data": {
    "payrollRun": {
      "id": 123,
      "period_id": 456,
      "pay_date": "2023-05-15",
      "status": "completed",
      "report_title": "Bi-weekly Payroll",
      "period_start": "2023-05-01",
      "period_end": "2023-05-14"
    },
    "summary": {
      "total_amount": "12345.67",
      "total_transactions": 10,
      "transactions_with_missing_info": 2
    },
    "items": [
      {
        "payroll_item_id": 789,
        "employee_id": "E001",
        "employee_name": "Jane Doe",
        "amount": "1234.56",
        "bank_name": "First National Bank",
        "account_type": "Checking",
        "routing_number": "XXXX6789", // Masked for security
        "account_number": "XXXX5678", // Masked for security
        "has_banking_info": true
      }
    ]
  }
}
```

## Security Measures

1. **Encryption:** All bank account information is encrypted in the database
2. **Masking:** Account numbers are masked in JSON responses
3. **Authorization:** Only administrators can access ACH reports
4. **Audit Trail:** All report generation is logged in the system audit trail

## Implementation Notes

1. The system will only include employees with valid banking information in the ACH report
2. Employees without banking information will be included in the summary but not in the CSV output
3. The report will only include employees with net pay greater than zero
4. Only primary bank accounts with direct deposit enabled are included

## Usage with Banking Systems

The CSV format is designed to be compatible with most banking ACH file import systems. The file should be uploaded to your banking portal following your bank's specific process for batch payments.
