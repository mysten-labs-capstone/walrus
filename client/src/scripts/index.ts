// client/src/scripts/index.ts
import { uploadFile } from "./upload.js";
import { downloadBlob } from "./download.js";
import { quickBalanceCheck, getBalances, formatBalance } from "./utils/quickBalance.js";

const [, , command, ...args] = process.argv;

function printUsage() {
  console.log(`
Walrus File Storage CLI

Usage:
  upload <path> [options]            Upload a file with automatic payment tracking
  download <blobId> [dir] [filename] Download a blob
  balance                            Check your SUI/WAL balances
  cost <path> [epochs]               Calculate storage cost

Upload Options:
  --epochs <number>      Number of storage epochs (default: 3)
  --currency <SUI|WAL>   Currency for cost estimates (default: SUI)
  --no-payment           Skip payment info display (faster upload)

Examples:
  # Upload with payment info (default)
  npx tsx src/scripts/index.ts upload myfile.txt

  # Upload with WAL cost estimates for 5 epochs
  npx tsx src/scripts/index.ts upload myfile.txt --epochs 5 --currency WAL

  # Upload without payment info (faster)
  npx tsx src/scripts/index.ts upload myfile.txt --no-payment

  # Check balance
  npx tsx src/scripts/index.ts balance

  # Calculate cost before uploading
  npx tsx src/scripts/index.ts cost myfile.txt 3

  # Download
  npx tsx src/scripts/index.ts download <blobId>
`);
}

function parseArgs(args: string[]): {
  filePath?: string;
  epochs: number;
  currency: "SUI" | "WAL";
  showPaymentInfo: boolean;
  outputDir?: string;
  outputName?: string;
} {
  const parsed = {
    filePath: undefined as string | undefined,
    epochs: 3,
    currency: "SUI" as "SUI" | "WAL",
    showPaymentInfo: true,
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
    // Get file size (fast, no network call)
    const stats = await fs.stat(filePath);
    
    // Calculate costs locally (no network call needed)
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
    
    // Quick balance check
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

async function main(): Promise<void> {
  if (command === "upload") {
    const options = parseArgs(args);
    if (!options.filePath) {
      console.error("Error: Please provide a file path");
      process.exit(1);
    }
    
    // Upload with payment info by default, unless --no-payment flag is used
    await uploadFile(options.filePath, options.epochs, {
      showPaymentInfo: options.showPaymentInfo,
      currency: options.currency,
    });
    
  } else if (command === "download") {
    if (!args[0]) {
      console.error("Error: Please provide a blob ID");
      process.exit(1);
    }
    await downloadBlob(args[0], args[1] ?? ".", args[2]);
    
  } else if (command === "balance") {
    await checkBalance();
    
  } else if (command === "cost") {
    if (!args[0]) {
      console.error("Error: Please provide a file path");
      process.exit(1);
    }
    const epochs = args[1] ? parseInt(args[1], 10) : 3;
    await calculateCost(args[0], epochs);
    
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