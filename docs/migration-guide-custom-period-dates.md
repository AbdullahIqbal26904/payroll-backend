# Migration Guide: Custom Period Dates

## Quick Start

### Run the Migration

```bash
# Navigate to your project directory
cd /Users/abdullahiqbal/Downloads/payroll-backend

# Run the migration
node -e "
const db = require('./config/db');
const migration = require('./migrations/037_add_custom_period_dates_to_payroll_runs');

(async () => {
  try {
    console.log('Running migration: Add custom period dates to payroll_runs...');
    await migration.up(db);
    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
})();
"
```

### Verify Migration

```bash
# Check if columns were added
mysql -u your_username -p your_database -e "
  DESCRIBE payroll_runs;
"

# Should show:
# custom_period_start | date | YES | | NULL |
# custom_period_end   | date | YES | | NULL |
```

### Test the Feature

#### 1. Upload a Timesheet
```bash
curl -X POST http://localhost:5000/api/payroll/upload-timesheet \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test_timesheet.csv"
```

#### 2. Calculate with Custom Dates
```bash
curl -X POST http://localhost:5000/api/payroll/calculate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "periodId": 123,
    "periodStart": "2024-10-01",
    "periodEnd": "2024-10-25",
    "payDate": "2024-10-28"
  }'
```

#### 3. Verify Custom Dates Stored
```bash
# Check the payroll_runs table
mysql -u your_username -p your_database -e "
  SELECT id, period_id, custom_period_start, custom_period_end, status 
  FROM payroll_runs 
  ORDER BY id DESC 
  LIMIT 5;
"
```

#### 4. Check Timesheet Period API
```bash
curl -X GET http://localhost:5000/api/payroll/timesheet-periods \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "period_start": "2024-10-01",
      "period_end": "2024-10-31",
      "hasCustomDateRuns": true,
      "customDateRunsCount": 1,
      "customDateRunsInfo": "Run #42 (2024-10-01 to 2024-10-25)"
    }
  ]
}
```

## Rollback (If Needed)

```bash
node -e "
const db = require('./config/db');
const migration = require('./migrations/037_add_custom_period_dates_to_payroll_runs');

(async () => {
  try {
    console.log('Rolling back migration...');
    await migration.down(db);
    console.log('✅ Rollback completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  }
})();
"
```

## Common Issues

### Issue: Migration fails with "Column already exists"
**Solution:** Column was already added. Skip migration or run rollback first.

### Issue: Custom dates not appearing in API
**Solution:** Restart backend server after migration.

### Issue: Paystubs still showing old dates
**Solution:** 
1. Verify migration ran successfully
2. Check that custom dates differ from period dates
3. Recalculate payroll with custom dates

## Complete Checklist

- [ ] Migration executed successfully
- [ ] Database columns verified
- [ ] Backend server restarted
- [ ] Test payroll calculation with custom dates
- [ ] Verify custom dates stored in database
- [ ] Check timesheet period API shows custom date info
- [ ] Generate paystub and verify dates are correct
- [ ] Frontend updated (optional)

## Files Changed

1. `migrations/037_add_custom_period_dates_to_payroll_runs.js` (NEW)
2. `models/Payroll.js` (MODIFIED)
3. `models/Timesheet.js` (MODIFIED)
4. `controllers/payrollController.js` (MODIFIED)
5. `docs/custom-period-dates-tracking.md` (NEW)
6. `docs/custom-period-dates-implementation-summary.md` (NEW)

## Documentation

- **Full Documentation:** `docs/custom-period-dates-tracking.md`
- **Implementation Summary:** `docs/custom-period-dates-implementation-summary.md`
- **This Quick Guide:** `docs/migration-guide-custom-period-dates.md`
