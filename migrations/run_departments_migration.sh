#!/bin/bash

# Run the new migration for adding departments table
echo "Running migration 026_add_departments_table.js..."
node migrations/run.js 026_add_departments_table.js

echo "Migration completed!"
