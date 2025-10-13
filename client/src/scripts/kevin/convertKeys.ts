import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

// Find encoded key from keystore
const encodedKeys = [
  "YOUR_BASE64_OR_BECH32_KEY_HERE",
];

for (let i = 0; i < encodedKeys.length; i++) {
  const input = encodedKeys[i];
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
      console.log(`  Unsupported scheme: ${scheme}`);
      continue;
    }

    if (secretKey.length !== 32) {
      console.log(`  Unexpected secret key length: ${secretKey.length}`);
      continue;
    }

    const kp = Ed25519Keypair.fromSecretKey(secretKey);
    const address = kp.toSuiAddress();
    const hexKey = Buffer.from(secretKey).toString("hex");

    console.log(`  Derived address: ${address}`);
    console.log(`  Private key (hex): ${hexKey}`);

    console.log("");
  } catch (err) {
    console.log("  Failed to decode / derive:", err);
  }
}
