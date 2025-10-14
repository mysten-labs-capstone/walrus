import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

async function testSigner() {
  const privateKey = "0xf5eb20318e0c6f01ea9c11b41bdd3a7e6bdb4f673805d6ac035989c579954a66";
  
  // Try different ways to create the keypair
  console.log("Testing signer creation...\n");
  
  try {
    // Method 1: fromSecretKey with Buffer
    const signer1 = Ed25519Keypair.fromSecretKey(
      Buffer.from(privateKey.replace(/^0x/, ""), "hex")
    );
    console.log("✅ Method 1 (Buffer) - Address:", signer1.toSuiAddress());
    
    // Check balance
    const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
    const balance = await suiClient.getBalance({
      owner: signer1.toSuiAddress(),
    });
    console.log("💰 Balance:", balance.totalBalance, "MIST\n");
    
  } catch (err) {
    console.error("❌ Method 1 failed:", err);
  }
}

testSigner();