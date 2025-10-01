# Frontend Implementation Guide - Custom Period Dates

## Overview

This guide explains how to implement the frontend UI for the custom period dates feature. The backend now supports calculating payroll with custom date ranges while preserving the original uploaded timesheet data.

## Key Concepts

### 1. **Timesheet Periods** (Uploaded Data)
- These are the date ranges from the uploaded CSV files
- They represent the **full range of timesheet data available**
- Example: Upload CSV with Oct 1-31 creates a timesheet period with `period_start = 2024-10-01` and `period_end = 2024-10-31`
- **These dates should NEVER be modified** - they represent your raw data

### 2. **Custom Period Dates** (Calculation Ranges)
- These are optional date ranges used when calculating payroll
- They allow you to calculate payroll for **a subset of the uploaded timesheet data**
- Example: Calculate payroll for Oct 1-15 from a timesheet that has Oct 1-31 data
- Stored in `payroll_runs` table as `custom_period_start` and `custom_period_end`

### 3. **Payroll Runs** (Calculation Results)
- Each time you calculate payroll, a new payroll run is created
- The run stores which dates were actually used for calculation
- Multiple runs can be created from the same timesheet period using different date ranges

## Backend Behavior

### Current Implementation

```javascript
// When you call the calculate payroll API:
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",  // Optional
  "periodEnd": "2024-10-25",     // Optional
  "payDate": "2024-10-28"
}

// Backend does:
1. Creates payroll_run record (status: 'processing')
2. Uses periodStart/periodEnd if provided, otherwise uses timesheet period dates
3. Filters timesheet entries to only include dates within the range
4. Calculates payroll (gross pay, deductions, etc.)
5. Stores custom dates in payroll_run (if they differ from timesheet period)
6. Updates payroll_run status to 'completed'
```

### What Gets Stored

```sql
-- payroll_runs table
id: 42
period_id: 123
pay_date: 2024-10-28
status: 'completed'
custom_period_start: 2024-10-01  -- Only if different from timesheet period
custom_period_end: 2024-10-25     -- Only if different from timesheet period
```

### What Shows on Paystubs

```javascript
// Paystubs automatically use the correct dates:
- If custom_period_start/end exist: Shows custom dates
- If custom_period_start/end are NULL: Shows timesheet period dates
```

## Frontend Implementation

### 1. Timesheet Upload Page

**What to Display:**
```jsx
// After successful upload
✅ Timesheet uploaded successfully!
Period: October 1, 2024 - October 31, 2024
Total entries: 450
Period ID: 123
```

**No Changes Needed:**
This part stays the same - just upload the CSV and display the period dates.

---

### 2. Payroll Calculation Page

This is where you add the custom date selection feature.

#### UI Components Needed:

**Option A: Simple Toggle Design**

```jsx
import React, { useState } from 'react';
import DatePicker from 'react-datepicker';

function PayrollCalculationForm({ timesheetPeriods }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [useCustomDates, setUseCustomDates] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [payDate, setPayDate] = useState(new Date());

  const handlePeriodChange = (periodId) => {
    const period = timesheetPeriods.find(p => p.id === periodId);
    setSelectedPeriod(period);
    
    // Reset custom dates when period changes
    if (period) {
      setCustomStartDate(new Date(period.period_start));
      setCustomEndDate(new Date(period.period_end));
    }
  };

  const handleSubmit = async () => {
    const payload = {
      periodId: selectedPeriod.id,
      payDate: payDate.toISOString().split('T')[0]
    };

    // Only include custom dates if the toggle is ON and dates differ
    if (useCustomDates) {
      payload.periodStart = customStartDate.toISOString().split('T')[0];
      payload.periodEnd = customEndDate.toISOString().split('T')[0];
    }

    try {
      const response = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      
      if (data.success) {
        alert('Payroll calculated successfully!');
        // Redirect or update UI
      }
    } catch (error) {
      console.error('Error calculating payroll:', error);
    }
  };

  return (
    <div className="payroll-form">
      <h2>Calculate Payroll</h2>
      
      {/* Step 1: Select Timesheet Period */}
      <div className="form-group">
        <label>Select Timesheet Period</label>
        <select onChange={(e) => handlePeriodChange(parseInt(e.target.value))}>
          <option value="">-- Select Period --</option>
          {timesheetPeriods.map(period => (
            <option key={period.id} value={period.id}>
              {period.report_title} ({period.period_start} to {period.period_end})
            </option>
          ))}
        </select>
      </div>

      {selectedPeriod && (
        <>
          {/* Step 2: Choose Full or Custom Date Range */}
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={useCustomDates}
                onChange={(e) => setUseCustomDates(e.target.checked)}
              />
              Use custom date range (calculate for partial period)
            </label>
          </div>

          {/* Show info box */}
          <div className={`info-box ${useCustomDates ? 'warning' : 'info'}`}>
            {useCustomDates ? (
              <>
                <strong>📅 Custom Date Range Mode</strong>
                <p>You are calculating payroll for a custom date range. Only timesheet entries within the selected dates will be processed.</p>
                <p className="small">
                  Timesheet data available: {selectedPeriod.period_start} to {selectedPeriod.period_end}
                </p>
              </>
            ) : (
              <>
                <strong>✅ Full Period Mode</strong>
                <p>You are calculating payroll for the entire timesheet period ({selectedPeriod.period_start} to {selectedPeriod.period_end}).</p>
              </>
            )}
          </div>

          {/* Step 3: Date Pickers (shown if custom dates enabled) */}
          {useCustomDates && (
            <div className="custom-dates-section">
              <div className="form-group">
                <label>Custom Start Date</label>
                <DatePicker
                  selected={customStartDate}
                  onChange={(date) => setCustomStartDate(date)}
                  minDate={new Date(selectedPeriod.period_start)}
                  maxDate={new Date(selectedPeriod.period_end)}
                  dateFormat="yyyy-MM-dd"
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label>Custom End Date</label>
                <DatePicker
                  selected={customEndDate}
                  onChange={(date) => setCustomEndDate(date)}
                  minDate={customStartDate}
                  maxDate={new Date(selectedPeriod.period_end)}
                  dateFormat="yyyy-MM-dd"
                  className="form-control"
                />
              </div>

              <div className="alert alert-warning">
                <strong>⚠️ Important:</strong> Only timesheet entries between{' '}
                <strong>{customStartDate.toLocaleDateString()}</strong> and{' '}
                <strong>{customEndDate.toLocaleDateString()}</strong> will be included in the calculation.
              </div>
            </div>
          )}

          {/* Step 4: Pay Date */}
          <div className="form-group">
            <label>Pay Date</label>
            <DatePicker
              selected={payDate}
              onChange={(date) => setPayDate(date)}
              dateFormat="yyyy-MM-dd"
              className="form-control"
            />
          </div>

          {/* Step 5: Submit Button */}
          <button onClick={handleSubmit} className="btn btn-primary">
            Calculate Payroll
          </button>
        </>
      )}
    </div>
  );
}

export default PayrollCalculationForm;
```

**Option B: Advanced Multi-Step Design**

```jsx
import React, { useState } from 'react';

function AdvancedPayrollCalculation({ timesheetPeriods }) {
  const [step, setStep] = useState(1);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [dateRangeOption, setDateRangeOption] = useState('full'); // 'full' or 'custom'
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [payDate, setPayDate] = useState(new Date());

  return (
    <div className="wizard">
      {/* Progress Indicator */}
      <div className="steps-indicator">
        <div className={`step ${step >= 1 ? 'active' : ''}`}>1. Select Period</div>
        <div className={`step ${step >= 2 ? 'active' : ''}`}>2. Date Range</div>
        <div className={`step ${step >= 3 ? 'active' : ''}`}>3. Pay Date</div>
        <div className={`step ${step >= 4 ? 'active' : ''}`}>4. Review</div>
      </div>

      {/* Step 1: Select Timesheet Period */}
      {step === 1 && (
        <div className="step-content">
          <h3>Step 1: Select Timesheet Period</h3>
          <div className="period-grid">
            {timesheetPeriods.map(period => (
              <div
                key={period.id}
                className={`period-card ${selectedPeriod?.id === period.id ? 'selected' : ''}`}
                onClick={() => setSelectedPeriod(period)}
              >
                <h4>{period.report_title}</h4>
                <p>{period.period_start} to {period.period_end}</p>
                <p className="small">{period.entry_count} entries</p>
                
                {/* Show warning if this period has custom date runs */}
                {period.hasCustomDateRuns && (
                  <div className="badge badge-info">
                    Has {period.customDateRunsCount} run(s) with custom dates
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <button 
            onClick={() => setStep(2)} 
            disabled={!selectedPeriod}
            className="btn btn-primary"
          >
            Next →
          </button>
        </div>
      )}

      {/* Step 2: Choose Date Range */}
      {step === 2 && (
        <div className="step-content">
          <h3>Step 2: Choose Calculation Date Range</h3>
          
          <div className="option-cards">
            {/* Full Period Option */}
            <div
              className={`option-card ${dateRangeOption === 'full' ? 'selected' : ''}`}
              onClick={() => setDateRangeOption('full')}
            >
              <div className="radio">
                <input type="radio" checked={dateRangeOption === 'full'} readOnly />
              </div>
              <div className="option-content">
                <h4>📊 Full Period</h4>
                <p>Calculate for the entire timesheet period</p>
                <p className="dates">
                  {selectedPeriod.period_start} to {selectedPeriod.period_end}
                </p>
                <p className="small text-muted">
                  Recommended for standard payroll runs
                </p>
              </div>
            </div>

            {/* Custom Range Option */}
            <div
              className={`option-card ${dateRangeOption === 'custom' ? 'selected' : ''}`}
              onClick={() => setDateRangeOption('custom')}
            >
              <div className="radio">
                <input type="radio" checked={dateRangeOption === 'custom'} readOnly />
              </div>
              <div className="option-content">
                <h4>🎯 Custom Date Range</h4>
                <p>Calculate for a specific date range</p>
                <p className="small text-muted">
                  Use this to split a month into multiple pay periods
                </p>
              </div>
            </div>
          </div>

          {/* Custom Date Pickers (if custom option selected) */}
          {dateRangeOption === 'custom' && (
            <div className="custom-date-inputs">
              <div className="row">
                <div className="col">
                  <label>Start Date</label>
                  <DatePicker
                    selected={customStartDate}
                    onChange={(date) => setCustomStartDate(date)}
                    minDate={new Date(selectedPeriod.period_start)}
                    maxDate={new Date(selectedPeriod.period_end)}
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
                <div className="col">
                  <label>End Date</label>
                  <DatePicker
                    selected={customEndDate}
                    onChange={(date) => setCustomEndDate(date)}
                    minDate={customStartDate || new Date(selectedPeriod.period_start)}
                    maxDate={new Date(selectedPeriod.period_end)}
                    dateFormat="yyyy-MM-dd"
                  />
                </div>
              </div>

              {customStartDate && customEndDate && (
                <div className="date-range-preview">
                  <strong>Selected Range:</strong>{' '}
                  {customStartDate.toLocaleDateString()} to {customEndDate.toLocaleDateString()}
                  <br />
                  <span className="small">
                    ({Math.ceil((customEndDate - customStartDate) / (1000 * 60 * 60 * 24)) + 1} days)
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="step-actions">
            <button onClick={() => setStep(1)} className="btn btn-secondary">
              ← Back
            </button>
            <button onClick={() => setStep(3)} className="btn btn-primary">
              Next →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Pay Date */}
      {step === 3 && (
        <div className="step-content">
          <h3>Step 3: Set Pay Date</h3>
          
          <div className="form-group">
            <label>When will employees be paid?</label>
            <DatePicker
              selected={payDate}
              onChange={(date) => setPayDate(date)}
              dateFormat="yyyy-MM-dd"
              minDate={new Date()}
            />
          </div>

          <div className="step-actions">
            <button onClick={() => setStep(2)} className="btn btn-secondary">
              ← Back
            </button>
            <button onClick={() => setStep(4)} className="btn btn-primary">
              Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Submit */}
      {step === 4 && (
        <div className="step-content">
          <h3>Step 4: Review & Calculate</h3>
          
          <div className="review-summary">
            <h4>Calculation Summary</h4>
            
            <table className="summary-table">
              <tbody>
                <tr>
                  <td><strong>Timesheet Period:</strong></td>
                  <td>{selectedPeriod.report_title}</td>
                </tr>
                <tr>
                  <td><strong>Available Data:</strong></td>
                  <td>{selectedPeriod.period_start} to {selectedPeriod.period_end}</td>
                </tr>
                <tr>
                  <td><strong>Calculation Range:</strong></td>
                  <td>
                    {dateRangeOption === 'full' ? (
                      <span>
                        {selectedPeriod.period_start} to {selectedPeriod.period_end}
                        <span className="badge badge-success">Full Period</span>
                      </span>
                    ) : (
                      <span>
                        {customStartDate.toLocaleDateString()} to {customEndDate.toLocaleDateString()}
                        <span className="badge badge-warning">Custom Range</span>
                      </span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>Pay Date:</strong></td>
                  <td>{payDate.toLocaleDateString()}</td>
                </tr>
              </tbody>
            </table>

            {dateRangeOption === 'custom' && (
              <div className="alert alert-warning">
                <strong>⚠️ Custom Date Range Selected</strong>
                <p>
                  Only timesheet entries between {customStartDate.toLocaleDateString()} and{' '}
                  {customEndDate.toLocaleDateString()} will be included. Paystubs will show these dates.
                </p>
              </div>
            )}
          </div>

          <div className="step-actions">
            <button onClick={() => setStep(3)} className="btn btn-secondary">
              ← Back
            </button>
            <button onClick={handleFinalSubmit} className="btn btn-success btn-lg">
              ✓ Calculate Payroll
            </button>
          </div>
        </div>
      )}
    </div>
  );

  async function handleFinalSubmit() {
    const payload = {
      periodId: selectedPeriod.id,
      payDate: payDate.toISOString().split('T')[0]
    };

    if (dateRangeOption === 'custom') {
      payload.periodStart = customStartDate.toISOString().split('T')[0];
      payload.periodEnd = customEndDate.toISOString().split('T')[0];
    }

    // Make API call
    // ... (same as Option A)
  }
}
```

---

### 3. Timesheet Periods List Page

Show which periods have payroll runs with custom dates.

```jsx
function TimesheetPeriodsList({ periods }) {
  return (
    <div className="periods-list">
      <h2>Timesheet Periods</h2>
      
      <table className="table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Date Range</th>
            <th>Entries</th>
            <th>Payroll Runs</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {periods.map(period => (
            <tr key={period.id}>
              <td>{period.report_title}</td>
              <td>{period.period_start} to {period.period_end}</td>
              <td>{period.entry_count}</td>
              <td>
                {period.hasCustomDateRuns ? (
                  <div>
                    <span className="badge badge-warning">
                      {period.customDateRunsCount} custom run(s)
                    </span>
                    <button
                      className="btn-link small"
                      onClick={() => showCustomRunsDetails(period)}
                    >
                      View Details
                    </button>
                  </div>
                ) : (
                  <span className="text-muted">No custom runs</span>
                )}
              </td>
              <td>
                <button className="btn btn-sm btn-primary">
                  View Entries
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Modal/Popup to show custom run details
function CustomRunsDetailsModal({ period }) {
  return (
    <div className="modal">
      <h3>Custom Date Runs for {period.report_title}</h3>
      <p><strong>Period Data:</strong> {period.period_start} to {period.period_end}</p>
      
      <div className="alert alert-info">
        <strong>📊 Custom Calculations:</strong>
        <p>{period.customDateRunsInfo}</p>
      </div>
      
      <p className="small text-muted">
        This means payroll was calculated multiple times using different date ranges from the same uploaded timesheet.
      </p>
    </div>
  );
}
```

---

### 4. Payroll Reports List Page

Show which runs used custom dates.

```jsx
function PayrollRunsList({ runs }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Run ID</th>
          <th>Period</th>
          <th>Calculation Dates</th>
          <th>Pay Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {runs.map(run => (
          <tr key={run.id}>
            <td>#{run.id}</td>
            <td>{run.report_title}</td>
            <td>
              {run.custom_period_start || run.custom_period_end ? (
                <div>
                  <span className="badge badge-warning">Custom</span>
                  {' '}
                  {run.custom_period_start || run.period_start} to{' '}
                  {run.custom_period_end || run.period_end}
                </div>
              ) : (
                <span>
                  {run.period_start} to {run.period_end}
                </span>
              )}
            </td>
            <td>{run.pay_date}</td>
            <td>
              <span className={`badge badge-${getStatusColor(run.status)}`}>
                {run.status}
              </span>
            </td>
            <td>
              <button className="btn btn-sm">View Report</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Common Use Cases

### Use Case 1: Monthly Payroll Split into Two

**Scenario:** Employee works full month but gets paid twice (1st-15th, 16th-31st)

```javascript
// Step 1: Upload timesheet for full month
POST /api/payroll/upload-timesheet
// CSV contains Oct 1-31 data
// Creates period ID 123

// Step 2: Calculate first half
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-01",
  "periodEnd": "2024-10-15",
  "payDate": "2024-10-18"
}
// Creates payroll run #42 with custom dates

// Step 3: Calculate second half
POST /api/payroll/calculate
{
  "periodId": 123,
  "periodStart": "2024-10-16",
  "periodEnd": "2024-10-31",
  "payDate": "2024-11-02"
}
// Creates payroll run #43 with custom dates

// Result:
// - Timesheet period 123: Oct 1-31 (unchanged)
// - Payroll run #42: Oct 1-15
// - Payroll run #43: Oct 16-31
// - Paystubs show correct dates for each run
```

### Use Case 2: Weekly Payroll from Monthly Timesheet

```javascript
// Upload monthly timesheet once
// Then create 4 weekly payroll runs:

POST /api/payroll/calculate
{ "periodId": 123, "periodStart": "2024-10-01", "periodEnd": "2024-10-07" }

POST /api/payroll/calculate
{ "periodId": 123, "periodStart": "2024-10-08", "periodEnd": "2024-10-14" }

POST /api/payroll/calculate
{ "periodId": 123, "periodStart": "2024-10-15", "periodEnd": "2024-10-21" }

POST /api/payroll/calculate
{ "periodId": 123, "periodStart": "2024-10-22", "periodEnd": "2024-10-31" }
```

### Use Case 3: Full Period Calculation (Default)

```javascript
// Just calculate for the entire period
POST /api/payroll/calculate
{
  "periodId": 123,
  "payDate": "2024-10-31"
}
// Uses timesheet period dates (Oct 1-31)
// custom_period_start and custom_period_end will be NULL
```

---

## API Reference Quick Guide

### Calculate Payroll

```
POST /api/payroll/calculate

Request Body:
{
  "periodId": number,          // Required
  "payDate": "YYYY-MM-DD",     // Optional (defaults to today)
  "periodStart": "YYYY-MM-DD", // Optional (for custom dates)
  "periodEnd": "YYYY-MM-DD"    // Optional (for custom dates)
}

Response:
{
  "success": true,
  "data": {
    "payrollRunId": 42,
    "periodId": 123,
    "payDate": "2024-10-28",
    "totalEmployees": 25,
    "payrollItems": [...],
    "errors": null
  }
}
```

### Get Timesheet Periods

```
GET /api/payroll/timesheet-periods?page=1&limit=10

Response:
{
  "success": true,
  "data": [
    {
      "id": 123,
      "report_title": "October 2024 Timesheet",
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "entry_count": 450,
      "hasCustomDateRuns": true,              // NEW
      "customDateRunsCount": 2,               // NEW
      "customDateRunsInfo": "Run #42..."      // NEW
    }
  ]
}
```

### Get Payroll Runs

```
GET /api/payroll/reports?page=1&limit=10

Response:
{
  "success": true,
  "data": [
    {
      "id": 42,
      "period_id": 123,
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "custom_period_start": "2024-10-01",    // NEW (or NULL)
      "custom_period_end": "2024-10-15",      // NEW (or NULL)
      "pay_date": "2024-10-18",
      "status": "completed",
      ...
    }
  ]
}
```

---

## Styling Recommendations

### CSS Classes

```css
/* Info boxes for date range mode */
.info-box {
  padding: 15px;
  border-radius: 5px;
  margin: 15px 0;
}

.info-box.info {
  background: #e3f2fd;
  border-left: 4px solid #2196f3;
}

.info-box.warning {
  background: #fff3e0;
  border-left: 4px solid #ff9800;
}

/* Badge for custom runs */
.badge-warning {
  background: #ff9800;
  color: white;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 12px;
}

/* Period selection cards */
.period-card {
  border: 2px solid #e0e0e0;
  padding: 15px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.period-card:hover {
  border-color: #2196f3;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.period-card.selected {
  border-color: #2196f3;
  background: #e3f2fd;
}

/* Option cards for date range selection */
.option-card {
  border: 2px solid #e0e0e0;
  padding: 20px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  gap: 15px;
}

.option-card.selected {
  border-color: #4caf50;
  background: #f1f8e9;
}
```

---

## Validation Rules

### Frontend Validation

```javascript
function validatePayrollCalculation(data, period) {
  const errors = [];

  // 1. Period ID required
  if (!data.periodId) {
    errors.push('Please select a timesheet period');
  }

  // 2. If custom dates provided, both must be present
  if (data.periodStart && !data.periodEnd) {
    errors.push('Both start and end dates required for custom range');
  }

  if (data.periodEnd && !data.periodStart) {
    errors.push('Both start and end dates required for custom range');
  }

  // 3. Custom dates must be within timesheet period range
  if (data.periodStart && period) {
    const customStart = new Date(data.periodStart);
    const periodStart = new Date(period.period_start);
    
    if (customStart < periodStart) {
      errors.push(`Start date cannot be before ${period.period_start}`);
    }
  }

  if (data.periodEnd && period) {
    const customEnd = new Date(data.periodEnd);
    const periodEnd = new Date(period.period_end);
    
    if (customEnd > periodEnd) {
      errors.push(`End date cannot be after ${period.period_end}`);
    }
  }

  // 4. Start date must be before or equal to end date
  if (data.periodStart && data.periodEnd) {
    const start = new Date(data.periodStart);
    const end = new Date(data.periodEnd);
    
    if (start > end) {
      errors.push('Start date must be before or equal to end date');
    }
  }

  return errors;
}
```

---

## Error Handling

```javascript
async function calculatePayroll(data) {
  try {
    const response = await fetch('/api/payroll/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      // Handle errors
      if (response.status === 400) {
        alert('Validation error: ' + result.message);
      } else if (response.status === 404) {
        alert('Period not found');
      } else {
        alert('Error calculating payroll: ' + result.message);
      }
      return null;
    }

    return result.data;
  } catch (error) {
    console.error('Network error:', error);
    alert('Failed to connect to server');
    return null;
  }
}
```

---

## Testing Checklist

### Manual Testing Steps

1. **Upload Timesheet**
   - [ ] Upload CSV with Oct 1-31
   - [ ] Verify period created with correct dates
   - [ ] Verify entry count is correct

2. **Calculate Full Period**
   - [ ] Select the period
   - [ ] Don't check "custom dates" option
   - [ ] Calculate payroll
   - [ ] Verify paystub shows Oct 1-31

3. **Calculate Custom Range**
   - [ ] Select the period
   - [ ] Check "custom dates" option
   - [ ] Set dates to Oct 1-15
   - [ ] Calculate payroll
   - [ ] Verify paystub shows Oct 1-15 (NOT Oct 1-31)

4. **Multiple Custom Runs**
   - [ ] Calculate Oct 1-15
   - [ ] Calculate Oct 16-31
   - [ ] Check timesheet period list shows "2 custom runs"
   - [ ] Verify both paystubs show correct dates

5. **Edge Cases**
   - [ ] Try to set start date before period start (should fail)
   - [ ] Try to set end date after period end (should fail)
   - [ ] Try to set start > end (should fail)

---

## Summary

### What You Need to Build

1. ✅ **Payroll Calculation Form** with:
   - Period selector dropdown
   - Toggle/checkbox for custom dates
   - Date pickers for custom start/end
   - Pay date picker
   - Submit button

2. ✅ **Timesheet Periods List** showing:
   - Period details
   - Badge if has custom date runs
   - Count of custom runs
   - Details popup/modal

3. ✅ **Payroll Runs List** showing:
   - Run details
   - Badge if used custom dates
   - Actual calculation dates

### What the Backend Does Automatically

1. ✅ Stores custom dates when they differ from period
2. ✅ Uses custom dates for paystub generation
3. ✅ Returns custom date info in API responses
4. ✅ Validates date ranges

### No Changes Needed

1. ✅ Timesheet upload process
2. ✅ Paystub generation (auto-uses correct dates)
3. ✅ Database schema (migration already created)

---

## Need Help?

- **Backend Documentation:** `/docs/custom-period-dates-tracking.md`
- **API Reference:** `/docs/custom-period-dates-api-reference.md`
- **Migration Guide:** `/docs/migration-guide-custom-period-dates.md`

Happy coding! 🚀
