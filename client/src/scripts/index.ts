// client/src/scripts/index.ts
import { uploadFile } from "./upload.js";
import { downloadBlob } from "./download.js";
import { quickBalanceCheck, getBalances, formatBalance } from "./utils/quickBalance.js";
import { KeyManager } from "./utils/keyManager.js";
import { EncryptionService } from "./utils/encryptionService.js";
import { EncryptionChecker } from "./utils/encryptionChecker.js";

const [, , command, ...args] = process.argv;

function printUsage() {
  console.log(`
Walrus File Storage CLI with Client-Side Encryption

Usage:
  upload <path> [options]            Upload a file (encrypted by default)
  download <blobId> [dir] [filename] Download and decrypt a blob
  check <blobId>                     Check if you can decrypt a blob before downloading
  balance                            Check your SUI/WAL balances
  cost <path> [epochs]               Calculate storage cost
  keys list                          List all stored encryption keys
  keys show <blobId>                 Show encryption key for a blob
  keys export <blobId> <path>        Export encryption key to file
  keys import <path>                 Import encryption key from file
  keys delete <blobId>               Delete encryption key

Upload Options:
  --epochs <number>      Number of storage epochs (default: 3)
  --currency <SUI|WAL>   Currency for cost estimates (default: SUI)
  --no-payment           Skip payment info display (faster upload)
  --no-encrypt           Upload without encryption

Download Options:
  --skip-decryption      Download encrypted file without decrypting
  --key <base64-key>     Use this key directly (no keystore needed)

Examples:
  # Upload with encryption (default)
  npx tsx src/scripts/index.ts upload myfile.txt

  # Upload without encryption
  npx tsx src/scripts/index.ts upload myfile.txt --no-encrypt

  # Check if you can decrypt before downloading
  npx tsx src/scripts/index.ts check <blobId>

  # Download with keystore (automatic)
  npx tsx src/scripts/index.ts download <blobId>

  # Download with direct key (no keystore needed)
  npx tsx src/scripts/index.ts download <blobId> . --key dGhpc2lzYWJhc2U2NGVuY29kZWRrZXk=

  # Show key for sharing
  npx tsx src/scripts/index.ts keys show <blobId>

  # List encryption keys
  npx tsx src/scripts/index.ts keys list

  # Export encryption key for backup
  npx tsx src/scripts/index.ts keys export <blobId> key-backup.json

  # Import encryption key
  npx tsx src/scripts/index.ts keys import key-backup.json

Sharing Files Securely:
  1. Upload: npx tsx src/scripts/index.ts upload secret.txt
  2. Get key: npx tsx src/scripts/index.ts keys show <blobId>
  3. Share:
     - Blob ID: <blobId> (via email/chat)
     - Key: <key-string> (via secure channel)
  4. Recipient downloads:
     npx tsx src/scripts/index.ts download <blobId> . --key <key-string>
`);
}

function parseArgs(args: string[]): {
  filePath?: string;
  epochs: number;
  currency: "SUI" | "WAL";
  showPaymentInfo: boolean;
  encrypt: boolean;
  skipDecryption: boolean;
  key?: string;
  outputDir?: string;
  outputName?: string;
} {
  const parsed = {
    filePath: undefined as string | undefined,
    epochs: 3,
    currency: "SUI" as "SUI" | "WAL",
    showPaymentInfo: true,
    encrypt: true,
    skipDecryption: false,
    key: undefined as string | undefined,
    outputDir: ".",
    outputName: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--epochs" && args[i + 1]) {
      parsed.epochs = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === "--currency" && args[i + 1]) {
      const curr = args[i + 1].toUpperCase();
      if (curr === "SUI" || curr === "WAL") {
        parsed.currency = curr;
      }
      i++;
    } else if (arg === "--no-payment") {
      parsed.showPaymentInfo = false;
    } else if (arg === "--no-encrypt") {
      parsed.encrypt = false;
    } else if (arg === "--skip-decryption") {
      parsed.skipDecryption = true;
    } else if (arg === "--key" && args[i + 1]) {
      parsed.key = args[i + 1];
      i++;
    } else if (!arg.startsWith("--")) {
      if (!parsed.filePath) {
        parsed.filePath = arg;
      } else if (!parsed.outputDir || parsed.outputDir === ".") {
        parsed.outputDir = arg;
      } else {
        parsed.outputName = arg;
      }
    }
  }

  return parsed;
}

async function checkBalance() {
  console.log("🔍 Checking balances...");
  
  const { suiClient, address } = await quickBalanceCheck();
  console.log(`\nAddress: ${address}`);
  
  const balances = await getBalances(suiClient, address);
  
  console.log("\n💳 Your Balances:");
  console.log("─".repeat(50));
  console.log(`SUI: ${formatBalance(balances.sui)} SUI`);
  console.log(`WAL: ${formatBalance(balances.wal)} WAL`);
  console.log("─".repeat(50));
  
  if (balances.sui === BigInt(0)) {
    console.log("\n💡 Get SUI tokens: https://faucet.testnet.sui.io/");
  }
  
  if (balances.wal === BigInt(0)) {
    console.log("💡 Get WAL tokens: walrus get-wal");
  }
}

async function calculateCost(filePath: string, epochs: number = 3) {
  const fs = await import("fs/promises");
  
  console.log("💰 Calculating storage cost...");
  
  try {
    const stats = await fs.stat(filePath);
    const MIN_GAS = 1_000_000;
    const bytesPerMist = 1_000;
    const sizeInMB = stats.size / (1024 * 1024);
    const costInMist = Math.ceil(sizeInMB * bytesPerMist * epochs);
    const suiCost = BigInt(Math.max(costInMist, MIN_GAS));
    const walCost = BigInt(Math.max(Math.floor(costInMist * 0.5), MIN_GAS));
    
    console.log("\n📊 Cost Estimate:");
    console.log("─".repeat(50));
    console.log(`File: ${filePath}`);
    console.log(`Size: ${stats.size} bytes`);
    console.log(`Epochs: ${epochs} (~${epochs * 30} days)`);
    console.log(`\nSUI cost: ${formatBalance(suiCost)} SUI`);
    console.log(`WAL cost: ${formatBalance(walCost)} WAL`);
    console.log("─".repeat(50));
    
    console.log("\n🔄 Checking your balance...");
    const { suiClient, address } = await quickBalanceCheck();
    const balances = await getBalances(suiClient, address);
    
    console.log(`\n💳 Current Balance:`);
    console.log(`SUI: ${formatBalance(balances.sui)} SUI`);
    console.log(`WAL: ${formatBalance(balances.wal)} WAL`);
    
    const canPaySui = balances.sui >= suiCost;
    const canPayWal = balances.wal >= walCost;
    
    console.log(`\n${canPaySui ? "✅" : "❌"} Sufficient SUI balance`);
    console.log(`${canPayWal ? "✅" : "❌"} Sufficient WAL balance`);
    
  } catch (error) {
    console.error("❌ Error calculating cost:", error);
    throw error;
  }
}

async function checkEncryption(blobId: string, providedKey?: string) {
  console.log("\n🔍 Checking encryption status...\n");
  
  const encryptionChecker = new EncryptionChecker();
  const result = await encryptionChecker.checkEncryptionStatus(blobId, providedKey);

  console.log("=".repeat(70));
  
  if (!result.metadata) {
    console.log("⚠️  No metadata found for this blob");
    console.log("\nThis could mean:");
    console.log("  • The blob was uploaded by someone else");
    console.log("  • The blob doesn't exist");
    console.log("  • Metadata file is missing");
    console.log("\nYou can still try to download it, but encryption status is unknown.");
  } else if (!result.isEncrypted) {
    console.log("✅ This blob is NOT encrypted");
    console.log("\nFile details:");
    console.log(`  Name: ${result.metadata.originalName}`);
    console.log(`  Size: ${result.metadata.size} bytes`);
    console.log(`  Type: ${result.metadata.contentType}`);
    console.log("\n✅ You can download this file normally without any decryption key.");
  } else if (result.canDecrypt) {
    console.log("🔒 This blob is ENCRYPTED");
    console.log("✅ You HAVE the decryption key");
    console.log("\nFile details:");
    console.log(`  Name: ${result.metadata.originalName}`);
    console.log(`  Size: ${result.metadata.size} bytes`);
    console.log(`  Type: ${result.metadata.contentType}`);
    console.log("\n✅ You can download and decrypt this file automatically.");
    console.log(`\nCommand: npx tsx src/scripts/index.ts download ${blobId}`);
  } else {
    console.log("🔒 This blob is ENCRYPTED");
    console.log("❌ You DO NOT have the decryption key");
    console.log("\nFile details:");
    console.log(`  Name: ${result.metadata.originalName}`);
    console.log(`  Size: ${result.metadata.size} bytes`);
    console.log(`  Type: ${result.metadata.contentType}`);
    
    if (result.warnings.length > 0) {
      console.log("\n⚠️  WARNINGS:");
      result.warnings.forEach(w => console.log(`  ${w}`));
    }
    
    if (result.recommendations.length > 0) {
      console.log("\n💡 RECOMMENDATIONS:");
      result.recommendations.forEach(r => console.log(`  ${r}`));
    }
  }
  
  console.log("=".repeat(70) + "\n");
}

async function manageKeys(subcommand: string, args: string[]) {
  const keyManager = new KeyManager();

  if (subcommand === "list") {
    const keys = await keyManager.listKeys();
    
    if (keys.length === 0) {
      console.log("No encryption keys stored.");
      return;
    }

    console.log("\n🔑 Stored Encryption Keys:");
    console.log("─".repeat(70));
    
    for (const key of keys) {
      console.log(`Blob ID: ${key.blobId}`);
      console.log(`File: ${key.fileName}`);
      console.log(`Created: ${new Date(key.createdAt).toLocaleString()}`);
      console.log("─".repeat(70));
    }
    
    console.log(`\nTotal: ${keys.length} key(s)`);
    console.log(`Keystore: ${keyManager.getKeystorePath()}`);
    
  } else if (subcommand === "show") {
    if (args.length < 1) {
      console.error("Error: Usage: keys show <blobId>");
      process.exit(1);
    }
    
    const blobId = args[0];
    const keyBuffer = await keyManager.getKey(blobId);
    
    if (!keyBuffer) {
      console.error(`❌ No encryption key found for blob ${blobId}`);
      process.exit(1);
    }
    
    const keyString = EncryptionService.exportKey(keyBuffer);
    const record = await keyManager.getKeyRecord(blobId);
    
    console.log("\n🔑 Encryption Key Details:");
    console.log("─".repeat(70));
    console.log(`Blob ID: ${blobId}`);
    if (record) {
      console.log(`File: ${record.fileName}`);
      console.log(`Created: ${new Date(record.createdAt).toLocaleString()}`);
    }
    console.log(`\nEncryption Key (base64):`);
    console.log(keyString);
    console.log("─".repeat(70));
    console.log(`\n💡 Share this key securely to allow decryption:`);
    console.log(`   npx tsx src/scripts/index.ts download ${blobId} . --key ${keyString}`);
    console.log(`\n⚠️  Anyone with this key can decrypt the file!`);
    
  } else if (subcommand === "export") {
    if (args.length < 2) {
      console.error("Error: Usage: keys export <blobId> <outputPath>");
      process.exit(1);
    }
    
    const [blobId, outputPath] = args;
    await keyManager.exportKey(blobId, outputPath);
    console.log(`✅ Encryption key exported to: ${outputPath}`);
    console.log(`⚠️  Keep this file secure! Anyone with this key can decrypt your file.`);
    
  } else if (subcommand === "import") {
    if (args.length < 1) {
      console.error("Error: Usage: keys import <keyFilePath>");
      process.exit(1);
    }
    
    const keyFilePath = args[0];
    await keyManager.importKey(keyFilePath);
    console.log(`✅ Encryption key imported successfully`);
    
  } else if (subcommand === "delete") {
    if (args.length < 1) {
      console.error("Error: Usage: keys delete <blobId>");
      process.exit(1);
    }
    
    const blobId = args[0];
    const deleted = await keyManager.deleteKey(blobId);
    
    if (deleted) {
      console.log(`✅ Encryption key for blob ${blobId} deleted`);
      console.log(`⚠️  You will no longer be able to decrypt this file!`);
    } else {
      console.log(`❌ No encryption key found for blob ${blobId}`);
    }
    
  } else {
    console.error(`Unknown keys subcommand: ${subcommand}`);
    console.log("\nAvailable commands:");
    console.log("  keys list");
    console.log("  keys show <blobId>");
    console.log("  keys export <blobId> <path>");
    console.log("  keys import <path>");
    console.log("  keys delete <blobId>");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (command === "upload") {
    const options = parseArgs(args);
    if (!options.filePath) {
      console.error("Error: Please provide a file path");
      process.exit(1);
    }
    
    await uploadFile(options.filePath, options.epochs, {
      showPaymentInfo: options.showPaymentInfo,
      currency: options.currency,
      encrypt: options.encrypt,
    });
    
  } else if (command === "download") {
    const options = parseArgs(args);
    if (!args[0]) {
      console.error("Error: Please provide a blob ID");
      process.exit(1);
    }
    await downloadBlob(args[0], options.outputDir ?? ".", options.outputName, {
      skipDecryption: options.skipDecryption,
      key: options.key,
    });
    
  } else if (command === "check") {
    if (!args[0]) {
      console.error("Error: Please provide a blob ID");
      console.log("\nUsage: npx tsx src/scripts/index.ts check <blobId>");
      console.log("       npx tsx src/scripts/index.ts check <blobId> --key <base64-key>");
      process.exit(1);
    }
    const options = parseArgs(args.slice(1));
    await checkEncryption(args[0], options.key);
    
  } else if (command === "balance") {
    await checkBalance();
    
  } else if (command === "cost") {
    if (!args[0]) {
      console.error("Error: Please provide a file path");
      process.exit(1);
    }
    const epochs = args[1] ? parseInt(args[1], 10) : 3;
    await calculateCost(args[0], epochs);
    
  } else if (command === "keys") {
    if (!args[0]) {
      console.error("Error: Please provide a keys subcommand");
      console.log("\nAvailable commands:");
      console.log("  keys list");
      console.log("  keys show <blobId>");
      console.log("  keys export <blobId> <path>");
      console.log("  keys import <path>");
      console.log("  keys delete <blobId>");
      process.exit(1);
    }
    await manageKeys(args[0], args.slice(1));
    
  } else {
    printUsage();
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:");
  
  if (error instanceof Error) {
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
  } else if (typeof error === 'object' && error !== null) {
    console.error("Error details:", error);
  } else {
    console.error("Raw error:", String(error));
  }
  
  process.exit(1);
});