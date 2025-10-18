// client/src/scripts/upload.ts (UNIFIED VERSION)
import fs from "fs/promises";
import path from "path";
import { initWalrus } from "./utils/walrusClient.js";
import { validateFile, printValidationResult } from "./utils/fileValidator.js";
import { PaymentService } from "./utils/paymentService.js";

interface BlobMetadata {
  blobId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  paymentInfo?: {
    estimatedCost: string;
    currency: string;
    epochs: number;
  };
}

const METADATA_FILE = "blob-metadata.json";

async function saveMetadata(metadata: BlobMetadata): Promise<void> {
  let metadataList: BlobMetadata[] = [];

  try {
    const existing = await fs.readFile(METADATA_FILE, "utf-8");
    metadataList = JSON.parse(existing);
  } catch (error) {
    // File might not exist, which is fine
  }

  metadataList.push(metadata);
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadataList, null, 2));
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Upload file to Walrus with optional payment tracking
 * @param filePath - Path to file to upload
 * @param epochs - Number of storage epochs (default: 3)
 * @param options - Optional settings
 */
export async function uploadFile(
  filePath: string,
  epochs: number = 3,
  options: {
    showPaymentInfo?: boolean;
    currency?: "SUI" | "WAL";
  } = {}
): Promise<string> {
  const { showPaymentInfo = true, currency = "SUI" } = options;

  // Validate file before uploading
  const validation = await validateFile(filePath);
  printValidationResult(validation);

  if (!validation.isValid) {
    throw new Error("File validation failed. Upload cancelled.");
  }

  const { walrusClient, suiClient, signer } = await initWalrus();
  const signerAddress = signer.toSuiAddress();
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  let estimatedCost = BigInt(0);

  // Show payment info if requested
  if (showPaymentInfo) {
    const paymentService = new PaymentService(suiClient, signer);
    const costs = paymentService.calculateStorageCost(fileBuffer.length, epochs);
    estimatedCost = currency === "SUI" ? costs.sui : costs.wal;

    console.log("\n💰 Payment Information:");
    console.log("─".repeat(50));
    console.log(`File size: ${fileBuffer.length} bytes`);
    console.log(`Storage epochs: ${epochs} (~${epochs * 30} days)`);
    console.log(`Estimated SUI cost: ${paymentService.formatBalance(costs.sui)} SUI`);
    console.log(`Estimated WAL cost: ${paymentService.formatBalance(costs.wal)} WAL`);
    console.log(`\n💡 Note: Payment is handled automatically by Walrus`);
    console.log(`    Gas fees will be deducted from your SUI balance`);

    // Check balance
    const balances = await paymentService.getAllBalances(signerAddress);
    console.log("\n💳 Your Balances:");
    console.log(`SUI: ${paymentService.formatBalance(balances.sui)} SUI`);
    console.log(`WAL: ${paymentService.formatBalance(balances.wal)} WAL`);

    // Ensure sufficient balance for gas
    const MIN_GAS_NEEDED = BigInt(10_000_000); // 0.01 SUI minimum for gas
    if (balances.sui < MIN_GAS_NEEDED) {
      console.error(`\n❌ Insufficient SUI for gas fees!`);
      console.error(`Required: ${paymentService.formatBalance(MIN_GAS_NEEDED)} SUI (minimum)`);
      console.error(`Available: ${paymentService.formatBalance(balances.sui)} SUI`);
      console.log("\n💡 Get SUI tokens: https://faucet.testnet.sui.io/");
      throw new Error(`Insufficient SUI balance for gas fees`);
    }
  }

  console.log(`\n📤 Uploading ${fileName} (${fileBuffer.length} bytes)...`);

  try {
    // Walrus handles payment internally - just upload
    const result = await walrusClient.writeBlob({
      blob: new Uint8Array(fileBuffer),
      deletable: true,
      epochs,
      signer,
    });

    const blobId = result.blobId;

    // Save metadata locally
    const metadata: BlobMetadata = {
      blobId,
      originalName: fileName,
      contentType: getMimeType(fileName),
      size: fileBuffer.length,
      uploadedAt: new Date().toISOString(),
    };

    if (showPaymentInfo) {
      const paymentService = new PaymentService(suiClient, signer);
      metadata.paymentInfo = {
        estimatedCost: paymentService.formatBalance(estimatedCost),
        currency: currency,
        epochs: epochs,
      };
    }

    await saveMetadata(metadata);

    console.log(`\n✅ Upload complete!`);
    console.log(`Blob ID: ${blobId}`);
    console.log(`Metadata saved to ${METADATA_FILE}`);
    
    if (showPaymentInfo) {
      const paymentService = new PaymentService(suiClient, signer);
      console.log(`\n💰 Payment Summary:`);
      console.log(`Estimated cost: ${paymentService.formatBalance(estimatedCost)} ${currency}`);
      console.log(`Storage duration: ${epochs} epochs (~${epochs * 30} days)`);
    }

    return blobId;
  } catch (error) {
    console.error("\n❌ Upload failed!");
    console.error(error);
    throw error;
  }
}