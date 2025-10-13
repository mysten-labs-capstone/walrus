import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { setDefaultResultOrder } from "dns";

setDefaultResultOrder('ipv4first');
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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
      timeout: 180_000,
      onError: (err) => {
        const normalErrors = [
          'not been registered',
          'already expired',
          'fetch failed'
        ]; // these 'errors' are due to the branching walrus does for uploads, it'll try as many nodes as possible!

        const isNormalError = normalErrors.some(msg => err.message.includes(msg));
        if (!isNormalError) {
          console.warn("⚠️ Unexpected storage error:", err.message);
        }
      },
    },
  });

  return { network, suiClient, walrusClient, signer };
}
