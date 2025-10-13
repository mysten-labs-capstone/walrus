import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export async function initWalrus() {
  const network = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
  const suiClient = new SuiClient({ url: getFullnodeUrl(network) });
  const privateKey = process.env.SUI_PRIVATE_KEY!;
  if (!privateKey) throw new Error("Missing SUI_PRIVATE_KEY in .env");

  const signer = Ed25519Keypair.fromSecretKey(
    Buffer.from(privateKey.replace(/^0x/, ""), "hex")
  );

  const walrusClient = new WalrusClient({
    network,
    suiClient,
    storageNodeClientOptions: {
      timeout: 60_000,
      onError: (err) => console.warn("Storage node error:", err.message),
    },
  });

  return { network, suiClient, walrusClient, signer };
}
