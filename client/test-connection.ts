import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import dotenv from "dotenv";

dotenv.config();

async function testConnection() {
  console.log("Testing Sui RPC connection...");
  console.log("Network:", process.env.NETWORK);
  
  const network = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
  const rpcUrl = getFullnodeUrl(network);
  console.log("RPC URL:", rpcUrl);
  
  const client = new SuiClient({ url: rpcUrl });
  
  try {
    const version = await client.getRpcApiVersion();
    console.log("✅ Connected! RPC version:", version);
    
    // Test getting chain identifier
    const chainId = await client.getChainIdentifier();
    console.log("✅ Chain ID:", chainId);
    
    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("❌ Connection failed:");
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

testConnection();