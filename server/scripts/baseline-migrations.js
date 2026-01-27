#!/usr/bin/env node

/**
 * Baseline existing migrations that have already been applied to the database
 * This is needed when the database has tables but Prisma doesn't have migration history
 */

const { execSync } = require('child_process');
const { resolve } = require('path');
const { config } = require('dotenv');

// Load .env from root directory
const envPath = resolve(__dirname, '../../.env');
config({ path: envPath });

// List of migrations that should already be applied (before the folders migration)
const existingMigrations = [
  '20260119063941_add_transactions',
  '20260122234011_add_encrypted_recovery_phrase',
  '20260123194234_add_argon2_encryption_fields'
];

console.log('Baseline: Marking existing migrations as applied...\n');

for (const migration of existingMigrations) {
  try {
    console.log(`Marking ${migration} as applied...`);
    execSync(`npx prisma migrate resolve --applied ${migration}`, {
      stdio: 'inherit',
      cwd: __dirname + '/..',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
    console.log(`✓ ${migration} marked as applied\n`);
  } catch (error) {
    console.log(`⚠ ${migration} - ${error.message}\n`);
  }
}

console.log('\nNow you can run: npm run migrate:deploy');
