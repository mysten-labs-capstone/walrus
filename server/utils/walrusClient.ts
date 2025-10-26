import { setDefaultResultOrder } from "dns";

type WalrusOptions = {
  privateKey?: string;
};

// dynamic import to avoid issues in upload api
export async function initWalrus(options: WalrusOptions = {}) {

  const { fileURLToPath } = await import("url");

  const __filename = fileURLToPath(import.meta.url);

  setDefaultResultOrder('ipv4first');

  if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    const path = await import("path");
    const { existsSync } = await import("fs");

    const rootDir = path.resolve(process.cwd(), "..");
    const envCandidates = [
      path.resolve(rootDir, ".env"),
      path.resolve(process.cwd(), ".env"),
    ];

    envCandidates
      .filter((envPath) => existsSync(envPath))
      .forEach((envPath) => dotenv.config({ path: envPath, override: true }));
  }

  const { getFullnodeUrl, SuiClient } = await import("@mysten/sui/client");
  const { WalrusClient } = await import("@mysten/walrus");
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");

  const network = (process.env.NETWORK?.toLowerCase() ?? "testnet") as
    | "testnet"
    | "mainnet";
  const rpcUrl = process.env.RPC_URL || getFullnodeUrl(network);

  const suiClient = new SuiClient({ url: rpcUrl });

  const rawPrivateKey = options.privateKey?.trim() || process.env.SUI_PRIVATE_KEY;
  if (!rawPrivateKey) {
    throw new Error("Missing SUI_PRIVATE_KEY in environment variables or request payload");
  }

  const normalizedKey = rawPrivateKey.startsWith("0x") ? rawPrivateKey.slice(2) : rawPrivateKey;
  if (!/^[0-9a-fA-F]+$/.test(normalizedKey) || normalizedKey.length !== 64) {
    throw new Error("Invalid Ed25519 private key format. Expect 32-byte hex string");
  }

  const signer = Ed25519Keypair.fromSecretKey(Buffer.from(normalizedKey, "hex"));

  const walrusClient = new WalrusClient({
    network,
    suiClient: suiClient as any, // temporary fix to stop vercel type-checking errors
    storageNodeClientOptions: {
      timeout: 180_000,
      onError: (err) => {
        const normalErrors = [
          'not been registered',
          'already expired',
          'fetch failed'
        ];

        const isNormalError = normalErrors.some(msg => err.message.includes(msg));
        if (!isNormalError) {
          console.warn("⚠️ Unexpected storage error:", err.message);
        }
      },
    },
  });

  return { network, suiClient, walrusClient, signer };
}
