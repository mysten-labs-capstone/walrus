// backend/scripts/testWalrus.ts
import { initWalrus } from "../utils/walrusClient.ts";

(async () => {
  try {
    console.log("🔧 Testing Walrus initialization...");

    const { network, walrusClient, signer } = await initWalrus();

    console.log("✅ Walrus client initialized successfully!");
    console.log("🔑 Signer public key:", signer.getPublicKey().toBase64());

    // Access private fields dynamically to avoid TS type errors
    console.log("🌐 Network:", network);

    // Try pinging a storage node (optional)
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
    console.error("❌ initWalrus failed:", err);
  }
})();
