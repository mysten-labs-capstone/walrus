/**
 * Generate a master encryption key for the caching layer
 * Run: node scripts/generateMasterKey.js
 */

const crypto = require('crypto');

console.log('\nGenerating Master Encryption Key\n');
console.log('━'.repeat(60));

const masterKey = crypto.randomBytes(32).toString('hex');

console.log('\nAdd this to your .env file:\n');
console.log(`MASTER_ENCRYPTION_KEY=${masterKey}`);
console.log('\nIMPORTANT: Keep this key secret and backed up securely!');
console.log('━'.repeat(60));
console.log('\nThis key is used for:');
console.log('  • Dual encryption (user key + master key)');
console.log('  • Encrypting user identifiers');
console.log('  • Backup access to files if users lose their keys\n');
