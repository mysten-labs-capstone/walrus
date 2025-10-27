// backend/scripts/testWalrus.ts
import { initWalrus } from "../utils/walrusClient.ts";

async function main() {
  try {
    console.log("🔧 Testing Walrus initialization...");

    // 1️⃣ Get private key from CLI, env, or prompt
    const argKey = process.argv[2];
    const envKey = process.env.SUI_PRIVATE_KEY;
    const privateKey = (argKey || envKey || "").trim();

    if (!privateKey) {
      throw new Error(
        "Missing private key.\n\nUsage:\n  bun run backend/scripts/testWalrus.ts <privateKey>\n\n" +
        "or set SUI_PRIVATE_KEY in your environment."
      );
    }

    // 2️⃣ Initialize Walrus with provided key
    const { network, walrusClient, signer } = await initWalrus({ privateKey });

    console.log("✅ Walrus client initialized successfully!");
    console.log("🔑 Signer public key:", signer.getPublicKey().toBase64());
    console.log("🌐 Network:", network);

    // 3️⃣ Optional: ping first storage node
    try {
      const nodeClient = (walrusClient as any).storageNodeClients?.[0];
      if (nodeClient) {
        const res = await nodeClient.request_fn("status", {});
        console.log("🟢 Node status:", res);
      } else {
        console.warn("⚠️ No storage node clients available in Walrus client.");
      }
    } catch (err) {
      console.warn("⚠️ Could not fetch node status:", (err as Error).message);
    }
  } catch (err) {
    console.error("❌ initWalrus failed:", (err as Error).message);
  }
}

main();
