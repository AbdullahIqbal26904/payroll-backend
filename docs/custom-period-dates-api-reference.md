# Quick Reference: Custom Pay Period Dates API

## API Endpoints

### 1. Calculate Payroll with Custom Dates

**Endpoint:** `POST /api/payroll/calculate`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-token>
```

**Request Body:**
```json
{
  "periodId": 123,
  "periodStart": "2025-10-01",  // Optional: Custom start date (YYYY-MM-DD)
  "periodEnd": "2025-10-25",     // Optional: Custom end date (YYYY-MM-DD)
  "payDate": "2025-10-28"        // Optional: Pay date (defaults to today)
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payroll calculated successfully",
  "data": {
    "payrollRunId": 456,
    "periodId": 123,
    "payDate": "2025-10-28T00:00:00.000Z",
    "totalEmployees": 50,
    "payrollItems": [
      {
        "payrollItemId": 789,
        "employeeId": 10,
        "employeeName": "John Doe",
        "grossPay": 2500.00,
        "netPay": 2100.00,
        "totalDeductions": 400.00,
        "loanDeduction": 0.00
      }
      // ... more items
    ],
    "errors": null
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Period ID is required"
}
```

---

### 2. Update Period Dates

**Endpoint:** `PUT /api/payroll/timesheet-periods/:id/dates`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <your-token>
```

**Request Body:**
```json
{
  "periodStart": "2025-10-01",  // Required: New start date (YYYY-MM-DD)
  "periodEnd": "2025-10-25"     // Required: New end date (YYYY-MM-DD)
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Period dates updated successfully",
  "data": {
    "id": 123,
    "report_title": "Punch Report",
    "period_start": "2025-10-01",
    "period_end": "2025-10-25",
    "created_at": "2025-10-01T10:00:00.000Z",
    "updated_at": "2025-10-15T14:30:00.000Z"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Period start date must be before or equal to end date"
}
```

---

## JavaScript/React Examples

### Example 1: Calculate with Custom Dates (Inline)

```javascript
const calculatePayroll = async (periodId, customStart, customEnd) => {
  const response = await fetch('/api/payroll/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      periodId,
      periodStart: customStart,
      periodEnd: customEnd,
      payDate: new Date().toISOString().split('T')[0]
    })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log('Payroll calculated:', result.data);
    return result.data;
  } else {
    throw new Error(result.message);
  }
};

// Usage:
calculatePayroll(123, '2025-10-01', '2025-10-25')
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

### Example 2: Update Period Dates, Then Calculate

```javascript
const updateAndCalculate = async (periodId, newStart, newEnd, payDate) => {
  // Step 1: Update period dates
  const updateResponse = await fetch(`/api/payroll/timesheet-periods/${periodId}/dates`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      periodStart: newStart,
      periodEnd: newEnd
    })
  });

  const updateResult = await updateResponse.json();
  
  if (!updateResult.success) {
    throw new Error(updateResult.message);
  }

  console.log('Period updated:', updateResult.data);

  // Step 2: Calculate payroll (will use updated dates from DB)
  const calcResponse = await fetch('/api/payroll/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      periodId,
      payDate
    })
  });

  const calcResult = await calcResponse.json();
  
  if (calcResult.success) {
    console.log('Payroll calculated:', calcResult.data);
    return calcResult.data;
  } else {
    throw new Error(calcResult.message);
  }
};

// Usage:
updateAndCalculate(123, '2025-10-01', '2025-10-25', '2025-10-28')
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

### Example 3: Calculate with Default Dates (Backward Compatible)

```javascript
const calculateWithDefaults = async (periodId, payDate) => {
  const response = await fetch('/api/payroll/calculate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({
      periodId,
      payDate
      // No periodStart or periodEnd - uses DB defaults
    })
  });

  const result = await response.json();
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.message);
  }
};

// Usage:
calculateWithDefaults(123, '2025-10-28')
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

---

## Axios Examples

### Using Axios with Custom Dates

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// Calculate with custom dates
const calculatePayroll = async (periodId, startDate, endDate, payDate) => {
  try {
    const response = await api.post('/payroll/calculate', {
      periodId,
      periodStart: startDate,
      periodEnd: endDate,
      payDate
    });
    
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};

// Update period dates
const updatePeriodDates = async (periodId, startDate, endDate) => {
  try {
    const response = await api.put(`/payroll/timesheet-periods/${periodId}/dates`, {
      periodStart: startDate,
      periodEnd: endDate
    });
    
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
};

// Usage:
(async () => {
  try {
    // Method 1: Direct calculation with custom dates
    const result = await calculatePayroll(123, '2025-10-01', '2025-10-25', '2025-10-28');
    console.log('Payroll calculated:', result);

    // Method 2: Update then calculate
    await updatePeriodDates(123, '2025-10-26', '2025-10-30');
    const result2 = await calculatePayroll(123, null, null, '2025-11-05');
    console.log('Second payroll calculated:', result2);
  } catch (error) {
    console.error('Failed:', error);
  }
})();
```

---

## cURL Examples

### Calculate with Custom Dates

```bash
curl -X POST http://localhost:3000/api/payroll/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "periodId": 123,
    "periodStart": "2025-10-01",
    "periodEnd": "2025-10-25",
    "payDate": "2025-10-28"
  }'
```

### Update Period Dates

```bash
curl -X PUT http://localhost:3000/api/payroll/timesheet-periods/123/dates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "periodStart": "2025-10-01",
    "periodEnd": "2025-10-25"
  }'
```

### Calculate with Default Dates

```bash
curl -X POST http://localhost:3000/api/payroll/calculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "periodId": 123,
    "payDate": "2025-10-28"
  }'
```

---

## Common Use Cases

### Use Case 1: Split Month into Two Pay Periods

```javascript
// Upload CSV once with Oct 1-30 data
// Period ID 123 created

// First payroll: Oct 1-25
await fetch('/api/payroll/calculate', {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    periodId: 123,
    periodStart: '2025-10-01',
    periodEnd: '2025-10-25',
    payDate: '2025-10-28'
  })
});

// Second payroll: Oct 26-30
await fetch('/api/payroll/calculate', {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({
    periodId: 123,
    periodStart: '2025-10-26',
    periodEnd: '2025-10-30',
    payDate: '2025-11-05'
  })
});
```

### Use Case 2: Weekly Payrolls from Monthly Data

```javascript
// Upload CSV with full month (Oct 1-31)
// Period ID 456

const weeks = [
  { start: '2025-10-01', end: '2025-10-07', pay: '2025-10-10' },
  { start: '2025-10-08', end: '2025-10-14', pay: '2025-10-17' },
  { start: '2025-10-15', end: '2025-10-21', pay: '2025-10-24' },
  { start: '2025-10-22', end: '2025-10-31', pay: '2025-10-31' }
];

for (const week of weeks) {
  await fetch('/api/payroll/calculate', {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      periodId: 456,
      periodStart: week.start,
      periodEnd: week.end,
      payDate: week.pay
    })
  });
}
```

---

## Error Handling

```javascript
const calculateWithErrorHandling = async (periodId, startDate, endDate, payDate) => {
  try {
    const response = await fetch('/api/payroll/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        periodId,
        periodStart: startDate,
        periodEnd: endDate,
        payDate
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      // Handle HTTP errors
      throw new Error(result.message || `HTTP error! status: ${response.status}`);
    }
    
    if (!result.success) {
      // Handle application errors
      throw new Error(result.message || 'Calculation failed');
    }
    
    return result.data;
    
  } catch (error) {
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('Network error:', error);
      throw new Error('Network error. Please check your connection.');
    }
    
    console.error('Calculation error:', error);
    throw error;
  }
};
```

---

## Validation Examples

### Frontend Validation

```javascript
const validateDates = (periodStart, periodEnd, csvStart, csvEnd) => {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const csvStartDate = new Date(csvStart);
  const csvEndDate = new Date(csvEnd);
  
  // Check if dates are valid
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }
  
  // Check if start is before end
  if (start > end) {
    return { valid: false, error: 'Start date must be before end date' };
  }
  
  // Check if dates are within CSV range
  if (start < csvStartDate || end > csvEndDate) {
    return { 
      valid: false, 
      error: `Dates must be within CSV range (${csvStart} to ${csvEnd})` 
    };
  }
  
  return { valid: true };
};

// Usage:
const validation = validateDates('2025-10-01', '2025-10-25', '2025-10-01', '2025-10-30');
if (!validation.valid) {
  alert(validation.error);
  return;
}
```

---

## TypeScript Types

```typescript
interface CalculatePayrollRequest {
  periodId: number;
  periodStart?: string;  // Optional: YYYY-MM-DD
  periodEnd?: string;    // Optional: YYYY-MM-DD
  payDate?: string;      // Optional: YYYY-MM-DD
}

interface UpdatePeriodDatesRequest {
  periodStart: string;   // Required: YYYY-MM-DD
  periodEnd: string;     // Required: YYYY-MM-DD
}

interface PayrollItem {
  payrollItemId: number;
  employeeId: number;
  employeeName: string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  loanDeduction: number;
}

interface CalculatePayrollResponse {
  success: boolean;
  message: string;
  data?: {
    payrollRunId: number;
    periodId: number;
    payDate: string;
    totalEmployees: number;
    payrollItems: PayrollItem[];
    errors: any[] | null;
  };
}

interface Period {
  id: number;
  report_title: string;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

interface UpdatePeriodDatesResponse {
  success: boolean;
  message: string;
  data?: Period;
}
```
