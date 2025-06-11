# Database Migrations for Payroll Application

This folder contains database migrations for the Payroll Application, specialized for Antigua's tax regulations.

## Migration Structure

The migrations are numbered sequentially (e.g., 001_create_users.js, 002_create_employees.js) and should be executed in order.

Each migration file contains:
- `up()` function - to apply the migration
- `down()` function - to roll back the migration
- Informative comments explaining the purpose of the changes

## How to Run Migrations

### Run All Migrations

```bash
node migrations/run.js
```

### Run Up to a Specific Migration

```bash
node migrations/run.js --to 003
```

### Rollback to a Specific Migration

```bash
node migrations/run.js --rollback --to 002
```

### Rollback All Migrations

```bash
node migrations/run.js --rollback
```

## Migration Files

1. `001_create_users.js` - Creates the users table
2. `002_create_employees.js` - Creates the employees table
3. `003_create_timesheet_tables.js` - Creates timesheet periods and entries tables
4. `004_create_payroll_tables.js` - Creates payroll calculation tables
5. `005_create_audit_trail.js` - Creates audit trail table
6. `006_create_settings_tables.js` - Creates system and payroll settings tables
7. `007_add_hours_decimal.js` - Adds hours_decimal column to timesheet_entries
8. `008_create_default_data.js` - Inserts default admin user and settings

## Important Notes

1. Each migration checks if it needs to be applied before making changes
2. Foreign keys and indexes are properly set up for performance
3. Error handling is included in each migration
4. All tables are created with proper data types according to Antigua's requirements
