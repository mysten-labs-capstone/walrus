#!/usr/bin/env node

/**
 * Helper script to run Prisma commands with .env loaded from parent directory
 * Usage: node scripts/run-prisma.js <prisma-command> [args...]
 * Example: node scripts/run-prisma.js migrate deploy
 */

const { execSync } = require('child_process');
const { resolve } = require('path');
const { config } = require('dotenv');

// Load .env from root directory (only if DATABASE_URL is not already set)
// This allows the script to work both locally (with .env) and on Render (with env vars)
if (!process.env.DATABASE_URL) {
  const envPath = resolve(__dirname, '../../.env');
  config({ path: envPath });
}

// Get the Prisma command and arguments
const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error('Usage: node scripts/run-prisma.js <prisma-command> [args...]');
  console.error('Example: node scripts/run-prisma.js migrate deploy');
  process.exit(1);
}

// Build the command
const prismaCmd = `npx prisma ${args.join(' ')}`;

try {
  execSync(prismaCmd, { 
    stdio: 'inherit',
    cwd: __dirname + '/..'
  });
} catch (error) {
  process.exit(error.status || 1);
}
