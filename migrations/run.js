/**
 * Migration Runner
 * 
 * This script runs database migrations in sequence or rolls them back.
 * It can be used to apply or rollback migrations to a specific version.
 * 
 * Usage:
 * - Run all migrations: node migrations/run.js
 * - Run up to a specific migration: node migrations/run.js --to 003
 * - Rollback to a specific migration: node migrations/run.js --rollback --to 002
 * - Rollback all migrations: node migrations/run.js --rollback
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

/**
 * Get command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsedArgs = {
    rollback: args.includes('--rollback'),
    to: null
  };

  const toIndex = args.indexOf('--to');
  if (toIndex !== -1 && args.length > toIndex + 1) {
    parsedArgs.to = args[toIndex + 1];
  }

  return parsedArgs;
}

/**
 * Create migrations table if it doesn't exist
 * @param {Object} connection - Database connection
 * @returns {Promise<void>}
 */
async function ensureMigrationsTable(connection) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await connection.query(createTableQuery);
}

/**
 * Get applied migrations from database
 * @param {Object} connection - Database connection
 * @returns {Promise<Array>} List of applied migrations
 */
async function getAppliedMigrations(connection) {
  const [rows] = await connection.query('SELECT name FROM migrations ORDER BY id ASC');
  return rows.map(row => row.name);
}

/**
 * Get all migration files
 * @returns {Array} Sorted list of migration files
 */
function getMigrationFiles() {
  const migrationsDir = path.join(__dirname);
  return fs.readdirSync(migrationsDir)
    .filter(file => file.match(/^\d{3}_.*\.js$/))
    .sort();
}

/**
 * Apply a migration
 * @param {Object} connection - Database connection
 * @param {String} file - Migration filename
 * @returns {Promise<void>}
 */
async function applyMigration(connection, file) {
  const migration = require(path.join(__dirname, file));
  console.log(`Applying migration: ${file}`);
  
  try {
    await migration.up(connection);
    await connection.query('INSERT INTO migrations (name) VALUES (?)', [file]);
    console.log(`Migration applied: ${file}\n`);
  } catch (error) {
    console.error(`Error applying migration ${file}:`, error);
    throw error;
  }
}

/**
 * Rollback a migration
 * @param {Object} connection - Database connection
 * @param {String} file - Migration filename
 * @returns {Promise<void>}
 */
async function rollbackMigration(connection, file) {
  const migration = require(path.join(__dirname, file));
  console.log(`Rolling back migration: ${file}`);
  
  try {
    await migration.down(connection);
    await connection.query('DELETE FROM migrations WHERE name = ?', [file]);
    console.log(`Migration rolled back: ${file}\n`);
  } catch (error) {
    console.error(`Error rolling back migration ${file}:`, error);
    throw error;
  }
}

/**
 * Run migrations
 * @param {Object} args - Command-line arguments
 * @returns {Promise<void>}
 */
async function run(args) {
  let connection;
  
  try {
    // Create database if it doesn't exist
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });
    
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    await connection.query(`USE ${process.env.DB_NAME}`);
    
    // Ensure migrations table exists
    await ensureMigrationsTable(connection);
    
    // Get applied migrations and available migration files
    const appliedMigrations = await getAppliedMigrations(connection);
    const migrationFiles = getMigrationFiles();
    
    if (args.rollback) {
      // Handle rollback logic
      const migrationsToRollback = [...appliedMigrations].reverse();
      
      if (args.to) {
        // Rollback to a specific migration
        const toIndex = migrationsToRollback.findIndex(m => m.startsWith(args.to));
        if (toIndex !== -1) {
          migrationsToRollback.splice(0, toIndex);
        }
      }
      
      for (const migration of migrationsToRollback) {
        await rollbackMigration(connection, migration);
      }
    } else {
      // Handle apply logic
      let migrationsToApply = migrationFiles.filter(file => !appliedMigrations.includes(file));
      
      if (args.to) {
        // Apply up to a specific migration
        const toIndex = migrationFiles.findIndex(m => m.startsWith(args.to));
        if (toIndex !== -1) {
          migrationsToApply = migrationsToApply.filter(
            (_, index) => migrationFiles.indexOf(_) <= toIndex
          );
        }
      }
      
      for (const migration of migrationsToApply) {
        await applyMigration(connection, migration);
      }
    }
    
    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Execute migrations
const args = parseArgs();
run(args);
