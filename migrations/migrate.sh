#!/bin/bash

# Payroll Application Database Migration Script for cPanel
# This script automates the migration process for deploying to cPanel environments

echo "=== Payroll Application Migration Tool ==="
echo "This script will run database migrations for your Payroll Application."

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is required but not found"
  exit 1
fi

# Check for environment file
if [ ! -f ".env" ]; then
  echo "Warning: .env file not found. Creating a template .env file."
  cat > .env << EOL
DB_HOST=localhost
DB_USER=your_cpanel_db_user
DB_PASSWORD=your_cpanel_db_password
DB_NAME=your_cpanel_db_name
EOL
  echo "Please update the .env file with your cPanel database credentials."
  exit 1
fi

# Function to handle migrations
run_migrations() {
  echo "Running migrations..."
  node migrations/run.js "$@"
  
  if [ $? -eq 0 ]; then
    echo "Migrations completed successfully."
  else
    echo "Error: Migration failed. Check the error messages above."
    exit 1
  fi
}

# Main script logic
case "$1" in
  --rollback)
    if [ -n "$2" ] && [ "$2" == "--to" ] && [ -n "$3" ]; then
      echo "Rolling back migrations to version $3..."
      run_migrations --rollback --to "$3"
    else
      echo "Rolling back all migrations..."
      run_migrations --rollback
    fi
    ;;
  --to)
    if [ -n "$2" ]; then
      echo "Running migrations up to version $2..."
      run_migrations --to "$2"
    else
      echo "Error: Missing version number. Usage: ./migrate.sh --to 003"
      exit 1
    fi
    ;;
  --help)
    echo "Payroll Application Migration Tool"
    echo "Usage:"
    echo "  ./migrate.sh                   Run all pending migrations"
    echo "  ./migrate.sh --to 003          Run migrations up to version 003"
    echo "  ./migrate.sh --rollback        Rollback all migrations"
    echo "  ./migrate.sh --rollback --to 002   Rollback to version 002"
    echo "  ./migrate.sh --help            Display this help message"
    ;;
  *)
    echo "Running all pending migrations..."
    run_migrations
    ;;
esac

echo "Migration process completed. Check the output above for details."
