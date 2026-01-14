export async function initWalrus() {
  const { setDefaultResultOrder } = await import("dns");
  setDefaultResultOrder("ipv4first");

  if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    const path = await import("path");

    const rootDir = path.resolve(process.cwd(), "..");
    const envPath = path.resolve(rootDir, ".env");

    dotenv.config({ path: envPath });
  }

  const { getFullnodeUrl, SuiClient } = await import("@mysten/sui/client");
  const { WalrusClient } = await import("@mysten/walrus");
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");

  const network = (process.env.NETWORK?.toLowerCase() ?? "testnet") as
    | "testnet"
    | "mainnet";

  const rpcUrl = process.env.RPC_URL || getFullnodeUrl(network);
  const suiClient = new SuiClient({ url: rpcUrl });

  const rawPrivateKey = process.env.SUI_PRIVATE_KEY?.trim();

  const normalizedKey = rawPrivateKey?.startsWith("0x")
    ? rawPrivateKey.slice(2)
    : rawPrivateKey;

  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error("Invalid Ed25519 private key format (expected 32-byte hex string).");
  }

  const signer = Ed25519Keypair.fromSecretKey(Buffer.from(normalizedKey, "hex"));

  const walrusClient = new WalrusClient({
    network,
    suiClient: suiClient as any,
    storageNodeClientOptions: {
      timeout: 180_000,
      onError: (err) => {
        const normalErrors = [
          "not been registered",
          "already expired",
          "fetch failed",
        ];
        const isNormalError = normalErrors.some((msg) =>
          err.message.includes(msg)
        );
        if (!isNormalError) {
          console.warn("Unexpected storage error:", err.message);
        }
      },
    },
  });

  return { network, suiClient, walrusClient, signer };
}