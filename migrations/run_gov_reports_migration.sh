#!/bin/bash

# Run the new migration for adding departments table
echo "Running migration 032_add_government_report_fields.js..."
node migrations/run.js 032_add_government_report_fields.js

echo "Migration completed!"
