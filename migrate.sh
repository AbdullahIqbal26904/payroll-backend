#!/bin/bash

# Run the migration to add hours_decimal column
echo "Running migration to add hours_decimal column..."
node config/migrations/addHoursDecimal.js
