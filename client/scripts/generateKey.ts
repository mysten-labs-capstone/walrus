#!/usr/bin/env tsx
/**
 * Generate a new Sui keypair for testing
 * Run: npm run generate-key
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

function generateKeypair() {
  // Generate a new random keypair
  const keypair = new Ed25519Keypair();
  
  // Get the private key (32 bytes as hex string)
  const privateKey = keypair.getSecretKey();
  const privateKeyHex = '0x' + Buffer.from(privateKey).toString('hex');
  
  // Get the public key and address
  const publicKey = keypair.getPublicKey().toSuiAddress();
  
  console.log('\n🔐 New Sui Keypair Generated\n');
  console.log('━'.repeat(80));
  console.log('\n📍 Address:');
  console.log(`   ${publicKey}`);
  console.log('\n🔑 Private Key (KEEP SECRET):');
  console.log(`   ${privateKeyHex}`);
  console.log('\n⚠️  WARNING: This is for TESTING only!');
  console.log('   Never share your private key with anyone.');
  console.log('   Store it securely and never commit it to version control.\n');
  console.log('━'.repeat(80));
  console.log('\n💡 To use this key:');
  console.log('   1. Copy the private key above');
  console.log('   2. Paste it into the Walrus Storage login screen');
  console.log('   3. Fund this address with testnet SUI tokens from:');
  console.log('      https://faucet.testnet.sui.io/\n');
}

generateKeypair();
