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

  const rpcUrl = process.env.VITE_SUI_RPC_URL || getFullnodeUrl(network);
  const suiClient = new SuiClient({ url: rpcUrl });

  const rawPrivateKey = process.env.SUI_PRIVATE_KEY?.trim();

  if (!rawPrivateKey) {
    throw new Error(
      "SUI_PRIVATE_KEY is not set. For localhost, add SUI_PRIVATE_KEY (and optionally NETWORK, RPC_URL) to a .env file in the project root. Use the same network as production (e.g. mainnet) if you need to interact with production blobs."
    );
  }

  const normalizedKey = rawPrivateKey.startsWith("0x")
    ? rawPrivateKey.slice(2)
    : rawPrivateKey;

  if (!/^[0-9a-fA-F]{64}$/.test(normalizedKey)) {
    throw new Error(
      "Invalid SUI_PRIVATE_KEY: expected 32-byte hex string (64 hex chars, optional 0x prefix)."
    );
  }

  const signer = Ed25519Keypair.fromSecretKey(Buffer.from(normalizedKey, "hex"));

  const uploadRelayHost =
    process.env.WALRUS_UPLOAD_RELAY_URL ||
    (network === "mainnet"
      ? "https://upload-relay.mainnet.walrus.space"
      : "https://upload-relay.testnet.walrus.space");

  // Relay requires a tip; SDK fetches tip-config and adds tip to register tx. Max in MIST (1 SUI = 1e9 MIST).
  const relayTipMaxMist = process.env.WALRUS_RELAY_TIP_MAX_MIST
    ? parseInt(process.env.WALRUS_RELAY_TIP_MAX_MIST, 10)
    : 50_000;

  const walrusClient = new WalrusClient({
    network,
    suiClient: suiClient as any,
    uploadRelay: {
      host: uploadRelayHost,
      sendTip: { max: relayTipMaxMist },
    },
    storageNodeClientOptions: {
      timeout: 240_000, // 4 minutes - increased for higher epochs and Vercel deployments
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