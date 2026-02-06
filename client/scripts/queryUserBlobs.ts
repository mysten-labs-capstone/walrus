/**
 * Query User Blobs from Blockchain
 *
 * Usage:
 *   npm run query:blobs "word1 word2 word3 ... word12"
 *
 * Example:
 *   npm run query:blobs "abandon abandon abandon ... art"
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "..", "..", ".env") });

// @ts-ignore - polyfill fetch for Node.js v16
globalThis.fetch = fetch;

const client = new SuiClient({
  url: process.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443",
});

const PACKAGE_ID = process.env.VITE_SOVEREIGNTY_PACKAGE_ID || "";
const SUI_DERIVATION_DOMAIN = "infinity-storage-sui-identity-v1";
const KEY_LENGTH = 32;

function deriveMasterKey(mnemonic: string): Uint8Array {
  if (!validateMnemonic(mnemonic, englishWordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  const entropyBytes = mnemonicToEntropy(mnemonic, englishWordlist);

  const keyBytes = new Uint8Array(KEY_LENGTH);
  keyBytes.set(entropyBytes.slice(0, KEY_LENGTH));

  return keyBytes;
}

function deriveSuiKeypair(masterKey: Uint8Array): Ed25519Keypair {
  const domainBytes = new TextEncoder().encode(SUI_DERIVATION_DOMAIN);
  const combined = new Uint8Array(masterKey.length + domainBytes.length);
  combined.set(masterKey);
  combined.set(domainBytes, masterKey.length);
  const seed = sha256(combined);
  return Ed25519Keypair.fromSecretKey(seed);
}

async function findUserRegistry(userAddress: string): Promise<string | null> {
  try {
    let allEvents: any[] = [];
    let cursor: string | null | undefined = null;
    let hasNextPage = true;

    console.log(`\n Searching for registry events for address: ${userAddress}`);

    for (let i = 0; i < 5 && hasNextPage; i++) {
      const result = await client.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::registry::RegistryCreated` },
        cursor,
        limit: 50,
      });

      console.log(
        `   Page ${i + 1}: Found ${result.data.length} events (hasNextPage: ${result.hasNextPage})`,
      );
      allEvents = allEvents.concat(result.data);
      hasNextPage = result.hasNextPage;
      cursor = result.nextCursor;

      if (!hasNextPage) break;
    }

    console.log(`   Total events fetched: ${allEvents.length}\n`);

    // Find event where owner matches userAddress
    for (const event of allEvents) {
      const parsedJson = event.parsedJson as any;
      console.log(
        `   Checking event: owner=${parsedJson?.owner}, registry=${parsedJson?.registry_id}`,
      );
      if (parsedJson?.owner === userAddress) {
        console.log(`   Match found!\n`);
        return parsedJson.registry_id;
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding registry:", error);
    return null;
  }
}

function bytesToHex(bytes: number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getUserBlobs(userAddress: string, registryId: string) {
  console.log(`\nUser Information:`);
  console.log(`  Sui Address: ${userAddress}`);
  console.log(`  Registry ID: ${registryId}\n`);

  try {
    const registryObject = await client.getObject({
      id: registryId,
      options: { showContent: true },
    });

    if (registryObject.data?.content?.dataType === "moveObject") {
      const fields = (registryObject.data.content as any).fields;
      const filesMap = fields.files?.fields?.contents || [];

      if (filesMap.length === 0) {
        console.log("  Registry exists but contains no files\n");
        return [];
      }

      console.log(`  Found ${filesMap.length} file(s):\n`);

      const blobs = filesMap.map((entry: any, index: number) => {
        const fileIdBytes = entry.fields.key;
        const metadata = entry.fields.value.fields;

        const fileId = bytesToHex(fileIdBytes);
        const blobIdBytes = metadata.blob_id;
        const blobId = Array.isArray(blobIdBytes)
          ? String.fromCharCode(...blobIdBytes)
          : blobIdBytes;
        const encrypted = metadata.encrypted;
        const expirationEpoch = metadata.expiration_epoch;

        console.log(`  ${index + 1}. Blob ID: ${blobId}`);
        console.log(`     File ID: ${fileId.substring(0, 16)}...`);
        console.log(`     Encrypted: ${encrypted}`);
        console.log(`     Expiration Epoch: ${expirationEpoch}\n`);

        return {
          fileId,
          blobId,
          encrypted,
          expirationEpoch,
        };
      });

      return blobs;
    }
  } catch (error) {
    console.error("  ❌ Error reading registry:", error);
  }

  return [];
}

async function main() {
  const input = process.argv.slice(2).join(" ");

  if (!input) {
    console.error(
      '❌ Usage: npm run query:blobs "word1 word2 word3 ... word12"',
    );
    console.error("\nExample:");
    console.error(
      '  npm run query:blobs "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art"',
    );
    console.error(
      "\nProvide your 12-word recovery phrase to query your files on the blockchain.",
    );
    process.exit(1);
  }

  if (!PACKAGE_ID) {
    console.error("❌ VITE_SOVEREIGNTY_PACKAGE_ID not set in environment");
    process.exit(1);
  }

  console.log("🔍 Querying User Blobs from Blockchain");
  console.log(`📦 Package ID: ${PACKAGE_ID}`);
  console.log(
    `🌐 RPC URL: ${process.env.VITE_SUI_RPC_URL || "https://fullnode.testnet.sui.io:443"}\n`,
  );
  console.log("─".repeat(80));

  try {
    // Derive master key from recovery phrase
    const masterKey = deriveMasterKey(input);
    const masterKeyHex = Array.from(masterKey)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    console.log(`\n Debug Info:`);
    console.log(`   Master Key (hex): ${masterKeyHex}`);
    console.log(`   Master Key length: ${masterKey.length} bytes\n`);

    // Derive Sui keypair and address
    const keypair = deriveSuiKeypair(masterKey);
    const userAddress = keypair.toSuiAddress();

    // Find user's registry
    const registryId = await findUserRegistry(userAddress);

    if (!registryId) {
      console.log("\n❌ No FileRegistry found for this recovery phrase");
      console.log("   This could mean:");
      console.log("   - You haven't uploaded any files yet");
      console.log("   - The blockchain sync hasn't completed yet");
      console.log(`   - Your Sui address: ${userAddress}\n`);
      process.exit(0);
    }

    // Get and display blobs
    const blobs = await getUserBlobs(userAddress, registryId);

    // Summary
    console.log("─".repeat(80));
    console.log(`\n Total: ${blobs.length} file(s) registered on blockchain\n`);
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
