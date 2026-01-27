#!/usr/bin/env node

/**
 * Check if the folders migration needs to be resolved (marked as applied)
 * because the Folder table already exists in the database.
 * This handles the case where the table was created manually or migration
 * history is out of sync.
 */

const { execSync } = require('child_process');
const { resolve } = require('path');
const { config } = require('dotenv');
const { Client } = require('pg');

// Load .env from root directory (only if DATABASE_URL is not already set)
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, '../../.env');
  config({ path: envPath });
}

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not found');
  process.exit(1);
}

const migrationName = '20260123000000_add_folders';

console.log(`Checking if Folder table exists and migration needs resolution...\n`);

async function checkAndResolve() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    
    // Check if Folder table exists
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'Folder'
      );
    `);
    
    const folderTableExists = result.rows[0].exists;
    
    if (folderTableExists) {
      console.log('✓ Folder table exists in database');
      console.log(`  Attempting to resolve migration ${migrationName} as applied...\n`);
      
      // Try to resolve the migration as applied
      try {
        execSync(
          `node scripts/run-prisma.js migrate resolve --applied ${migrationName}`,
          { 
            cwd: __dirname + '/..',
            stdio: 'inherit'
          }
        );
        console.log(`\n✓ Migration ${migrationName} resolved successfully`);
        console.log('  Migration marked as applied since Folder table already exists.\n');
      } catch (resolveError) {
        // If resolve fails (e.g., migration already in history), that's OK
        console.log(`\n⚠ Could not resolve migration (may already be in history)`);
        console.log('  Will proceed with normal migration...\n');
      }
    } else {
      console.log('✓ Folder table does not exist, will apply migration normally\n');
    }
    
    await client.end();
  } catch (error) {
    console.log(`⚠ Error checking database: ${error.message}`);
    console.log('  Will proceed with normal migration...\n');
    try {
      await client.end();
    } catch {}
  }
}

// Run the check
checkAndResolve().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(0); // Exit 0 so build continues
});
