# Database Migrations for Payroll Application

This directory contains database migration scripts for the Payroll Application, designed specifically for Antigua's tax regulations. The migration system allows for incremental database schema updates, making deployment to cPanel and other environments more reliable.

## Migration Architecture

The migrations are organized in sequential numbered files that can be executed in order. Each migration is idempotent - it can be run multiple times without causing issues and will only apply changes if necessary.

### Key Features

- **Sequential Migration Files**: Files are prefixed with numbers (001, 002, etc.) indicating their execution order
- **Up/Down Functions**: Each migration includes functions to apply (`up`) and rollback (`down`) changes
- **Self-Contained**: Each migration checks if changes are needed before applying them
- **Comprehensive Error Handling**: All database operations are wrapped in try/catch blocks
- **Migration Tracking**: Applied migrations are recorded in a `migrations` table

## Migration Files

1. **001_create_users.js**: Creates the users table with authentication fields
2. **002_create_employees.js**: Creates the employees table with employment details
3. **003_create_timesheet_tables.js**: Creates tables for timesheet periods and entries
4. **004_create_payroll_tables.js**: Creates payroll runs and items tables
5. **005_create_audit_trail.js**: Creates the audit trail table for change tracking
6. **006_create_settings_tables.js**: Creates system and payroll settings tables
7. **007_add_hours_decimal.js**: Adds the hours_decimal column to timesheet_entries
8. **008_create_default_data.js**: Inserts default admin user and settings

## Running Migrations

### Prerequisites

1. Node.js (v14 or higher)
2. MySQL database connection details
3. Environment variables set in `.env` file:
   - `DB_HOST`: Database hostname (usually 'localhost' on cPanel)
   - `DB_USER`: Database username
   - `DB_PASSWORD`: Database password
   - `DB_NAME`: Database name

### Using the Migration Script

The `migrate.sh` script provides a convenient way to run migrations:

```bash
# Give execution permission (first time only)
chmod +x migrations/migrate.sh

# Run all pending migrations
./migrations/migrate.sh

# Run migrations up to a specific version
./migrations/migrate.sh --to 003

# Rollback all migrations
./migrations/migrate.sh --rollback

# Rollback to a specific version
./migrations/migrate.sh --rollback --to 002

# Show help
./migrations/migrate.sh --help
```

### Using Node Directly

You can also run migrations using Node.js directly:

```bash
# Run all pending migrations
node migrations/run.js

# Run migrations up to a specific version
node migrations/run.js --to 003

# Rollback all migrations
node migrations/run.js --rollback

# Rollback to a specific version
node migrations/run.js --rollback --to 002
```

## Deploying to cPanel

1. Upload all files to your cPanel environment
2. SSH into your server or use cPanel's Terminal
3. Navigate to your application directory
4. Create/update the `.env` file with your cPanel database credentials
5. Run the migration script: `./migrations/migrate.sh`

## Best Practices

1. **Always backup your database** before running migrations in production
2. Test migrations in a development environment first
3. When adding new migrations:
   - Follow the sequential naming convention (next number in sequence)
   - Always include both `up` and `down` functions
   - Make each migration focused on a specific change
   - Add thorough comments explaining the purpose of the change

## Payroll Calculation Rules

The database schema supports Antigua's specific tax rules including:

- **Social Security**: Employee (7%) and employer (9%) contributions with a maximum insurable earning of $6,500
- **Medical Benefits**: Employee (3.5%) and employer (3.5%) contributions, with reduced rates (2.5%) for seniors (60+)
- **Education Levy**: Basic rate (2.5%) for earnings up to $5,000, and higher rate (5%) for earnings above that threshold
- **Age-based Rules**: Special handling for retirement age (65), senior medical benefits age (60), and medical benefits maximum age (70)

## Troubleshooting

### Common Issues

1. **Permission Denied**: Run `chmod +x migrations/migrate.sh` to make the script executable
2. **Database Connection Failed**: Check your .env file and database credentials
3. **Migration Already Applied**: If a migration is already in the database, it will be skipped
4. **Foreign Key Constraints**: Migrations handle foreign key constraints in proper order

### Getting Help

If you encounter persistent issues:

1. Check the error messages which provide specific details on what went wrong
2. Verify database permissions - the user needs CREATE, ALTER and DROP privileges
3. For cPanel environments, ensure your MySQL version is at least 5.7
