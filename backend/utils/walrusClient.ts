import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";

export async function initWalrus() {
  const network = (process.env.NETWORK ?? "testnet") as "testnet" | "mainnet";
  const rpcUrl = process.env.RPC_URL || getFullnodeUrl(network);
  const suiClient = new SuiClient({ url: rpcUrl });

  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing SUI_PRIVATE_KEY in .env.local");

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
