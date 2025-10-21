import { setDefaultResultOrder } from "dns";

// dynamic import to avoid issues in upload api
export async function initWalrus() {

  const { fileURLToPath } = await import("url");

  const __filename = fileURLToPath(import.meta.url);

  setDefaultResultOrder('ipv4first');

  if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    const path = await import("path");
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
}

  const { getFullnodeUrl, SuiClient } = await import("@mysten/sui/client");
  const { WalrusClient } = await import("@mysten/walrus");
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");

  const network = (process.env.NETWORK?.toLowerCase() ?? "testnet") as
    | "testnet"
    | "mainnet";
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
