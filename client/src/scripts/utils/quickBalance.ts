// client/src/scripts/utils/quickBalance.ts
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Quick balance check without initializing full Walrus client
 * Much faster for balance/cost commands
 */
export async function quickBalanceCheck() {
  const network = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
  const suiClient = new SuiClient({ url: getFullnodeUrl(network) });
  const privateKey = process.env.SUI_PRIVATE_KEY!;
  
  if (!privateKey) {
    throw new Error("Missing SUI_PRIVATE_KEY in .env");
  }

  const signer = Ed25519Keypair.fromSecretKey(
    Buffer.from(privateKey.replace(/^0x/, ""), "hex")
  );

  const address = signer.toSuiAddress();

  return { suiClient, signer, address, network };
}

export function formatBalance(balance: bigint, decimals: number = 9): string {
  const divisor = BigInt(10 ** decimals);
  const whole = balance / divisor;
  const fraction = balance % divisor;
  return `${whole}.${fraction.toString().padStart(decimals, "0")}`;
}

export async function getBalances(suiClient: SuiClient, address: string) {
  const WAL_COIN_TYPE = "0x0b7a2d3e0c2f8b5e8a9c1f3d6e8b2a4c7e9f1b3d5e7a9c2e4f6b8d0a2c4e6f8::wal::WAL";
  
  try {
    const [suiBalance, walBalance] = await Promise.all([
      suiClient.getBalance({
        owner: address,
        coinType: "0x2::sui::SUI",
      }).catch(() => ({ totalBalance: "0" })),
      suiClient.getBalance({
        owner: address,
        coinType: WAL_COIN_TYPE,
      }).catch(() => ({ totalBalance: "0" }))
    ]);

    return {
      sui: BigInt(suiBalance.totalBalance),
      wal: BigInt(walBalance.totalBalance),
    };
  } catch (error) {
    console.warn("Warning: Error fetching balances");
    return {
      sui: BigInt(0),
      wal: BigInt(0),
    };
  }
}