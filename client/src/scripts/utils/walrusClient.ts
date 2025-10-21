import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { WalrusClient } from "@mysten/walrus";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import dotenv from "dotenv";
import path from "path";
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
        // These messages commonly occur when one storage node doesn't have a
        // particular sliver/shard but other nodes do. The Walrus client will
        // try multiple nodes and succeed even if some return 404s. Treat the
        // known messages as "normal" to avoid noisy warnings.
        const normalErrors = [
          'not been registered',
          'already expired',
          'fetch failed',
          'requested sliver is unavailable',
          '404',
          'not found',
          'sliver'
        ];

        const isNormalError = normalErrors.some((msg) =>
          err?.message?.toLowerCase().includes(msg)
        );

        // If the environment variable WALRUS_VERBOSE=true is set, always
        // print the full error for debugging. Otherwise only warn for
        // unexpected errors.
        if (process.env.WALRUS_VERBOSE === 'true') {
          console.warn("ℹ️ WALRUS storage node error (verbose):", err);
        } else if (!isNormalError) {
          console.warn("⚠️ Unexpected storage error:", err.message ?? err);
        }
      },
    },
  });

  return { network, suiClient, walrusClient, signer };
}
