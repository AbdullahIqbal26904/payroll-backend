#!/bin/bash

# Script to run the migration to remove department column
# This should be run after department_id is properly set for all employees

echo "Running migration to remove department column from employees table..."
node migrations/run.js --to 029

echo "Migration complete!"
