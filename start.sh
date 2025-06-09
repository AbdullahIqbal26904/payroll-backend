#!/bin/bash

# Navigate to project directory
cd "$(dirname "$0")"

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Creating default .env file..."
  cat > .env << EOL
PORT=5001
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=payroll_system
JWT_SECRET=payroll_application_secret_key_2025_highly_secure
JWT_EXPIRE=7d
EOL
  echo ".env file created. Please update with your database credentials."
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start the server
echo "Starting the Payroll System Backend..."
npm run dev
