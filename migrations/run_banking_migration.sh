#!/bin/bash

# Run the banking info migration script
echo "Running migration for employee banking information..."
node migrations/run.js --to 031

echo "Migration completed successfully."
