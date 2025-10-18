import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import dotenv from "dotenv";
import { setDefaultResultOrder } from "dns";

setDefaultResultOrder('ipv4first');
dotenv.config();

async function testWalrus() {
  console.log("Testing Walrus client...");
  
  const network = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
  const suiClient = new SuiClient({ url: getFullnodeUrl(network) });
  const privateKey = process.env.SUI_PRIVATE_KEY!;
  
  if (!privateKey) {
    throw new Error("Missing SUI_PRIVATE_KEY in .env");
  }
  
  console.log("Private key length:", privateKey.length);
  console.log("Network:", network);
  
  const signer = Ed25519Keypair.fromSecretKey(
    Buffer.from(privateKey.replace(/^0x/, ""), "hex")
  );
  
  console.log("Signer address:", signer.toSuiAddress());
  
  const walrusClient = new WalrusClient({
    network,
    suiClient,
    storageNodeClientOptions: {
      timeout: 180_000,
      onError: (err) => {
        console.log("Storage node error:", err.message);
      },
    },
  });
  
  console.log("✅ WalrusClient created successfully");
  
  // Try uploading a tiny test blob
  console.log("\nAttempting to upload test data...");
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  
  try {
    const result = await walrusClient.writeBlob({
      blob: testData,
      deletable: true,
      epochs: 1, // Use just 1 epoch for testing
      signer,
    });
    
    console.log("✅ Upload successful!");
    console.log("Blob ID:", result.blobId);
  } catch (error) {
    console.error("❌ Upload failed:");
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

testWalrus();