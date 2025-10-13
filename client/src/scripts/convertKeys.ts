import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("❌ Usage: node --loader ts-node/esm src/scripts/kevin/convertKeys.ts <base64_or_bech32_key> [more_keys...]");
  process.exit(1);
}

// Load all the encoded keys from CLI args
const encodedKeys = args;
encodedKeys.forEach((input, i) => {
  console.log(`Key #${i + 1}:`);

  try {
    let scheme = "UNKNOWN";
    let secretKey: Uint8Array;

    if (input.startsWith("suiprivkey")) {
      // Bech32 encoded private key
      const parsed = decodeSuiPrivateKey(input);
      scheme = parsed.schema;
      secretKey = parsed.secretKey;
    } else {
      // Assume base64: first byte = scheme flag, rest = secret key
      const decoded = Buffer.from(input, "base64");
      scheme = decoded[0] === 0x00 ? "ED25519" : `SCHEME_${decoded[0]}`;
      secretKey = decoded.slice(1);
    }

    if (scheme !== "ED25519") {
      console.log(`  WARNING: Unsupported scheme: ${scheme}`);
      return;
    }

    if (secretKey.length !== 32) {
      console.log(`  WARNING: Unexpected secret key length: ${secretKey.length}`);
      return;
    }

    const kp = Ed25519Keypair.fromSecretKey(secretKey);
    const address = kp.toSuiAddress();
    const hexKey = Buffer.from(secretKey).toString("hex");

    console.log(`  [✔] Derived address: ${address}`);
    console.log(`  Private key (hex): ${hexKey}\n`);
  } catch (err) {
    console.log("  ❌ Failed to decode / derive:", err);
  }
});
