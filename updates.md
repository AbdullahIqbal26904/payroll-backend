# MSA Payroll System Update Proposal

## Executive Summary

This document outlines our understanding of the requested changes to the MSA Payroll System based on your recent requirements. I'll provide a detailed assessment of:

1. Current implementation status
2. Required changes to existing features
3. New features to be implemented
4. Technical approach and timeline

## Current Implementation Status

The current MSA Payroll System successfully implements the core Antigua payroll calculation rules including:

- Social Security calculations (7% employee, 9% employer) with $6,500 monthly cap
- Medical Benefits calculations with age-based rates
- Education Levy calculations with tiered rates
- Employee management with basic information storage
- Timesheet processing from CSV imports
- Payroll report generation

## Requested Changes and Additions

### 1. Employee Types and Compensation Rules

**Current Status**: The system now handles multiple employee types including:
- Salary (flat rate/admin) - with overtime calculation support
- Hourly - standard hourly employees
- Private Duty Nurse - shift-based rates without overtime eligibility:
  - Day shift (7am-7pm) Monday-Friday: $35/hour
  - Night shift (7pm-7am) all days: $40/hour
  - Day shift (7am-7pm) Saturday-Sunday: $40/hour

**Required Changes**:
- ✅ Create distinct employee types (flat rate/admin vs. hourly/nursing vs. private duty nurse)
- ✅ Implement overtime calculations for flat rate employees using the formula: `{(2500 x12) / (52 /40)}`
- Add sick day tracking (12 uncertified days annually)
- Implement handling for under-threshold work with options for vacation time, bereavement, or unpaid leave
- ✅ Configure hourly employees (nursing) without overtime eligibility

### 2. Payment Frequency Options

**Current Status**: The system supports bi-weekly and monthly payment frequencies.

**Required Changes**:
- Add "Weekly" and "Semi-Monthly" payment frequency options
- Update payroll calculations to handle these new frequencies appropriately

### 3. Employee Loan Management

**Current Status**: Basic loan functionality exists but needs enhancement.

**Required Changes**:
- Enhance the loan tracking to show current amount due
- Implement payment per paycheck calculations until the loan is repaid
- Update payroll calculation to include loan deductions
- Improve reporting to include loan details on paystubs

### 4. Vacation Entitlement

**Current Status**: Basic vacation accrual tracking exists.

**Required Changes**:
- Implement detailed vacation entitlement tracking
- Add interface for tracking and scheduling vacation dates
- Create validation for up to 7 vacation date entries

### 5. Third-Party Payments

**Current Status**: Not currently implemented.

**Required Additions**:
- Create functionality to manage payments to external entities (Credit Union, Car Loan, Land payments)
- Implement ACH file generation for bank disbursements
- Add account number tracking for third-party payments

### 6. Enhanced Reporting

**Current Status**: Basic payroll reports exist.

**Required Additions**:
- Management reports with filtering by "all", "range", or "department"
- Government reports showing EE and ER contributions over specific date ranges
- Bank-focused CSV export for ACH deposits
- Social security and medical benefits contribution reports
- Consolidated pay after deductions reports
- Individual employee payroll email functionality with period selection

### 7. System Settings

**Current Status**: Basic settings management exists.

**Required Additions**:
- Holiday configuration for automatic calculation in employee reports
- Admin interface for dropdown menu maintenance (Departments, etc.)

### 8. Additional Social Security and Medical Benefits Rules

**Current Status**: Basic age-based rules implemented.

**Required Changes**:
- Update Social Security rules to allow election to not pay at age 60 (with both EE and ER contributions stopping)
- Implement Medical Benefits rules for age 60 (0% ER, 2.5% EE) and age 70 (no payments required)

## Technical Implementation Approach

### Backend Changes

1. **Database Schema Updates**:
   - Create new tables for employee types, loan tracking, vacation entitlement
   - Add fields to existing tables for new payment frequencies, third-party payment information

2. **Model Updates**:
   - Enhance Payroll.js to handle different employee types and payment frequencies
   - Create new models for third-party payments and holiday settings

3. **Controller Updates**:
   - Update employeeController.js to handle new employee types and related fields
   - Create controllers for loan management, vacation entitlement, and third-party payments
   - Enhance payroll calculation controller with new rules

4. **Report Generation**:
   - Create new report templates for requested reports
   - Implement filtering capabilities for management reports
   - Build ACH file generation functionality

### Frontend Changes

1. **Employee Management**:
   - Add fields for employee type selection
   - Create interface for overtime eligibility and sick day tracking

2. **Loan Management**:
   - Build loan application and tracking interface
   - Implement loan payment schedule visualization

3. **Vacation Management**:
   - Create vacation entitlement tracking dashboard
   - Implement date selection for vacation scheduling

4. **Settings Management**:
   - Build holiday configuration interface
   - Create admin tools for dropdown menu maintenance

5. **Reporting Dashboard**:
   - Implement new filtering options
   - Create email distribution interface for payroll reports

## Changes to Existing Code

### employeeController.js

The employee controller will need significant updates to support the new employee types and related fields:

```javascript
// New fields to add to addEmployee and updateEmployee functions
const {
  employee_type, // 'flat_rate' or 'hourly_nursing'
  overtime_eligible,
  sick_days_remaining,
  vacation_entitlement,
  payment_frequency, // Add 'Weekly' and 'Semi-Monthly' options
  third_party_payments, // Array of payment details
  loan_information,
  is_exempt_ss_by_age, // For age 60+ SS election
} = req.body;
```

### Payroll.js

The payroll calculation logic will need to be updated to handle different employee types and payment rules:

```javascript
// New calculation methods for different employee types
static calculateFlatRatePayroll(employeeData, hoursWorked, payrollSettings) {
  // Standard 160 hours per month logic
  // Overtime calculation using {(2500 x12) / (52 /40)}
  // Sick day handling
  // Under-threshold handling
}

static calculateHourlyNursingPayroll(employeeData, hoursWorked, payrollSettings) {
  // Straight hourly calculation without overtime
}

// Enhanced deduction calculations for age-specific rules
static calculateDeductions(grossPay, age, settings, paymentFrequency, employeeData) {
  // Update Social Security election at age 60
  // Update Medical Benefits rates at age 60 and 70
}

// New methods for loan and third-party payment processing
static processLoanPayments(employeeId, grossPay, netPay) {
  // Calculate loan deductions
}

static processThirdPartyPayments(employeeId, netPay) {
  // Process payments to external entities
}
```

## Timeline Estimation

Based on the scope of changes required, we estimate the following timeline:

| Phase | Tasks | Duration |
|-------|-------|----------|
| 1. Analysis & Design | Detailed requirements gathering, database schema updates, API design | 2 weeks |
| 2. Backend Implementation | Model and controller updates, payroll calculation changes | 4 weeks |
| 3. Frontend Implementation | UI development for new features | 4 weeks |
| 4. Reporting Implementation | New report formats, email functionality | 3 weeks |
| 5. Testing & QA | Unit testing, integration testing, user acceptance testing | 3 weeks |
| 6. Deployment & Training | System deployment, documentation, user training | 2 weeks |
| **Total** | | **18 weeks** |

## Conclusion

The requested changes represent significant enhancements to the current MSA Payroll System. While the core calculation engine is already in place, the additions for employee types, loan management, third-party payments, and enhanced reporting will require substantial development effort.

We are confident that these changes can be implemented successfully within the estimated timeline. Upon your approval, we can proceed with the detailed requirements gathering phase and provide regular updates on progress.

## Recent Updates (July 25, 2025)

### Enhanced Email Functionality for Paystubs

We've implemented comprehensive email delivery functionality for paystubs with the following features:

1. **Bulk Email Delivery**:
   - Send paystubs to all employees in a specific payroll run
   - Automatically attaches generated PDF paystubs to emails
   - Includes payroll summary in the email body

2. **Individual Email Delivery**:
   - Send paystub to a specific employee
   - New dedicated API endpoint for single-employee emails
   - Same PDF attachment and summary format as bulk delivery

3. **Technical Improvements**:
   - Enhanced error handling and reporting
   - Detailed status tracking of email delivery
   - Year-to-date summaries included in emails

These enhancements complete the email delivery functionality requested in Phase 2, providing a reliable mechanism for distributing paystubs to employees automatically after payroll processing.

## Recent Updates (August 10, 2025)

### Management-Focused Deductions Report

We've implemented a comprehensive management-focused deductions report as requested, with the following features:

1. **Detailed Contribution Breakdown**:
   - Shows employee and employer contributions for Social Security
   - Shows employee and employer contributions for Medical Benefits
   - Shows Education Levy contributions (employee-only)
   - Displays gross pay and net pay for context

2. **Flexible Filtering Options**:
   - Filter by "all" employees for company-wide overview
   - Filter by date "range" for period-specific analysis
   - Filter by "department" for departmental analysis
   - Option to include or exclude inactive employees

3. **Multiple Output Formats**:
   - JSON format for application integration
   - CSV format for Excel analysis and reporting
   - Totals calculation for all columns

4. **Technical Implementation**:
   - New API endpoint: `/api/payroll/deductions-report`
   - Support for query parameters to control filtering
   - Efficient database queries for performance
   - Proper totaling and formatting of monetary values

This report fulfills the requirement for enhanced management reporting and will provide valuable insights for financial analysis and decision-making.

Please review this proposal and let me know if you need any clarification or have additional requirements to discuss.