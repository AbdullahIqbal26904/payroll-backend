# Employee Loan / Payroll Deduction Feature

## Overview

The Employee Loan feature allows the company to provide loans to employees and automatically deduct installments from their regular paychecks. This system ensures proper tracking of loan balances, payments, and provides transparent information to employees.

## What Is An Employee Loan?

An employee loan or payroll deduction loan is money lent by employers to someone who works for them. It's like a personal loan, except the interest rates are usually less than what a bank might offer.

## Database Structure

The loan functionality is supported by the following database tables:

1. **employee_loans**: Stores the main loan information
   - `id`: Unique identifier for the loan
   - `employee_id`: Reference to the employee
   - `loan_amount`: Original amount of the loan
   - `interest_rate`: Percentage of interest charged
   - `total_amount`: Total amount including interest to be repaid
   - `remaining_amount`: Current outstanding balance
   - `installment_amount`: Amount deducted per pay period
   - `start_date`: When the loan was issued
   - `expected_end_date`: Projected date for full repayment
   - `status`: Current loan status (active, completed, cancelled)
   - `notes`: Additional information about the loan

2. **loan_payments**: Tracks individual loan payments
   - `id`: Unique identifier for the payment
   - `loan_id`: Reference to the loan
   - `payroll_item_id`: Reference to the payroll item where deduction was made
   - `payment_amount`: Amount of this payment
   - `payment_date`: Date payment was processed

3. **payroll_items**: Updated with loan deduction column
   - `loan_deduction`: Amount deducted for loan payment in this pay period

## API Endpoints

### Loan Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loans` | Get all employee loans |
| POST | `/api/loans` | Create a new employee loan |
| GET | `/api/loans/:id` | Get details of a specific loan |
| PUT | `/api/loans/:id` | Update a loan |
| GET | `/api/employees/:id/loans` | Get all loans for a specific employee |

### Payroll Integration

The loan deductions are automatically calculated during payroll processing and are included in the paystub breakdown.

## Paystub Display

The paystub has been enhanced to include:

1. A line item in the deductions section showing the loan repayment amount
2. A detailed breakdown section showing:
   - Original loan amount
   - Interest rate
   - Total amount with interest
   - Current remaining balance
   - Payment amount per pay period
   - Loan start date
   - Expected end date
   - Brief explanation of what an employee loan is

## Implementation Details

When a payroll is processed, the system:

1. Checks if the employee has any active loans
2. If yes, includes the installment amount as a deduction
3. Updates the loan remaining balance
4. Records the payment in the loan_payments table
5. Includes loan details in the paystub PDF

If an employee has multiple active loans, the system will prioritize the oldest loan first.
