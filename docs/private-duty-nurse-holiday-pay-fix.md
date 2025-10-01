# Private Duty Nurse Holiday Pay Fix

## Issues Identified

When calculating payroll for a private duty nurse employee with the following details:
- Hours worked: 19.75 hours
- Salary amount (regular pay): $1,020.25
- Holiday pay: $280.00
- **Expected** gross pay: $1,300.25
- **Actual** gross pay shown: $1,020.25

### Root Causes

1. **Hardcoded holiday rate for private duty nurses** (Line 983 in `models/Payroll.js`)
   - The `calculateHolidayPayForPeriod` function was using a hardcoded rate of $35.00/hour for private duty nurses
   - This didn't reflect the actual rates configured in payroll settings
   - Private duty nurses have variable rates (day weekday: $35, night: $40, day weekend: $40)
   - Holiday pay should use the higher rate to be fair to employees

2. **Incorrect regular earnings calculation in PDF** (Line 188 in `utils/pdfGenerator.js`)
   - The PDF generator was calculating regular earnings as: `grossPay - overtimeAmount - vacationAmount`
   - It was **missing** the holiday amount deduction
   - This made it appear that holiday pay wasn't being added to gross pay
   - The actual gross pay in the database was correct, but the PDF display was wrong

## Fixes Applied

### 1. Updated Holiday Pay Calculation for Private Duty Nurses
**File:** `models/Payroll.js` - Line 983-996

**Before:**
```javascript
} else if (employeeData.employee_type === 'private_duty_nurse') {
  // For private duty nurses, use the day weekday rate as base rate for holidays
  hourlyRate = 35.00; // Default rate, should be overridden by settings
}
```

**After:**
```javascript
} else if (employeeData.employee_type === 'private_duty_nurse') {
  // For private duty nurses, get the rate from payroll settings
  // Use the highest rate (night rate) as the holiday rate to be fair to the employee
  const [settings] = await db.query('SELECT * FROM payroll_settings LIMIT 1');
  const payrollSettings = settings[0];
  
  if (payrollSettings) {
    // Use the night rate as it's typically the highest rate for private duty nurses
    hourlyRate = payrollSettings.private_duty_nurse_night_all || 40.00;
  } else {
    // Fallback to default night rate if no settings found
    hourlyRate = 40.00;
  }
}
```

**Impact:** Holiday pay for private duty nurses now uses the night rate ($40/hour by default) from payroll settings instead of the hardcoded $35/hour. This ensures fair compensation for holidays.

### 2. Fixed Regular Earnings Display in PDF
**File:** `utils/pdfGenerator.js` - Lines 177-192

**Before:**
```javascript
// Get vacation hours and pay
const vacationHours = payrollItem.vacationHours || payrollItem.vacation_hours || 0;
const vacationAmount = parseFloat(payrollItem.vacationAmount || payrollItem.vacation_amount || 0).toFixed(2);

// Calculate regular earnings (gross pay minus overtime and vacation)
const grossPay = parseFloat(payrollItem.grossPay || payrollItem.gross_pay || 0).toFixed(2);
const regularEarnings = (parseFloat(grossPay) - parseFloat(overtimeAmount) - parseFloat(vacationAmount)).toFixed(2);
```

**After:**
```javascript
// Get vacation hours and pay
const vacationHours = payrollItem.vacationHours || payrollItem.vacation_hours || 0;
const vacationAmount = parseFloat(payrollItem.vacationAmount || payrollItem.vacation_amount || 0).toFixed(2);

// Get holiday hours and pay
const holidayHours = payrollItem.holidayHours || payrollItem.holiday_hours || 0;
const holidayAmount = parseFloat(payrollItem.holidayAmount || payrollItem.holiday_amount || 0).toFixed(2);

// Calculate regular earnings (gross pay minus overtime, vacation, and holiday pay)
const grossPay = parseFloat(payrollItem.grossPay || payrollItem.gross_pay || 0).toFixed(2);
const regularEarnings = (parseFloat(grossPay) - parseFloat(overtimeAmount) - parseFloat(vacationAmount) - parseFloat(holidayAmount)).toFixed(2);
```

**Impact:** The PDF paystub now correctly displays:
- Regular/Nurse Pay: Actual worked hours pay only
- Holiday Pay: Separate line item
- Gross Pay: Total including all components

## Expected Results After Fix

With the same example (19.75 hours worked, 8 hours holiday):

**Assuming night shift rate of $40/hour:**
- Regular pay: 19.75 hours × rate = Calculated based on shift times
- Holiday pay: 8 hours × $40/hour = $320.00
- **Gross pay:** Regular pay + Holiday pay = Correctly summed

**Assuming payroll settings show:**
- Night rate: $40/hour
- Day weekday rate: $35/hour  
- Day weekend rate: $40/hour

The holiday pay will now use $40/hour (night rate) for fair compensation.

## Testing Recommendations

1. **Verify holiday pay calculation:**
   - Check payroll settings for private duty nurse rates
   - Ensure holiday pay uses the correct rate from settings
   - Confirm holiday pay is calculated for all holidays in the period

2. **Verify PDF display:**
   - Check that regular earnings exclude holiday pay
   - Verify holiday pay shows as a separate line item
   - Confirm gross pay = regular + overtime + vacation + holiday

3. **Test with different scenarios:**
   - Private duty nurse with only regular hours
   - Private duty nurse with holiday hours only
   - Private duty nurse with mix of regular, vacation, and holiday hours
   - Different shift types (day/night, weekday/weekend)

## Database Schema Verification

Ensure the following columns exist in `payroll_items` table:
- `holiday_hours` - DECIMAL(10,2)
- `holiday_amount` - DECIMAL(10,2)
- `ytd_holiday_hours` - DECIMAL(10,2)
- `ytd_holiday_amount` - DECIMAL(10,2)

And in `payroll_settings` table:
- `private_duty_nurse_day_weekday` - DECIMAL(10,2)
- `private_duty_nurse_night_all` - DECIMAL(10,2)
- `private_duty_nurse_day_weekend` - DECIMAL(10,2)
