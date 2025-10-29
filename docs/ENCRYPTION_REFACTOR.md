# Encryption Refactor: Master Key + User ID Hash

## Overview

This document describes the encryption refactoring that simplifies key management by using a deterministic key derivation approach based on a Master Encryption Key and User ID Hash.

## Motivation

**Previous Approach:**
- Generated a unique random encryption key for each file
- Stored keys in a local keystore file (`.walrus-keystore.json`)
- Required managing and backing up multiple encryption keys
- Risk of losing access to files if keystore was lost

**New Approach:**
- Uses a single application-wide Master Encryption Key
- Derives user-specific keys from the Master Key + User's wallet address hash
- Keys are deterministic - same user always gets the same key
- No need to store encryption keys - they can be re-derived on demand
- Simpler backup strategy - only need to protect the Master Key

## How It Works

### Key Derivation

```
User Encryption Key = HKDF-SHA256(
    input: MasterKey || SHA256(UserAddress),
    salt: empty,
    info: "walrus-file-encryption",
    length: 256 bits
)
```

1. **Master Key**: Application-wide 256-bit key (stored in `.env`)
2. **User ID Hash**: SHA256 hash of the user's Sui wallet address
3. **HKDF**: Combines both using HKDF-SHA256 to derive the final encryption key

### Encryption Process

1. User uploads a file
2. System derives encryption key from Master Key + User's wallet address
3. File is encrypted using AES-256-GCM with the derived key
4. Encrypted file is uploaded to Walrus
5. Metadata includes `keyDerivation: "master-user-hash"` to indicate the method

### Decryption Process

1. User downloads a file
2. System reads metadata to determine encryption method
3. If `keyDerivation: "master-user-hash"`:
   - Derives the same key from Master Key + User's wallet address
   - Decrypts the file using the derived key
4. If legacy encryption (old method):
   - Falls back to KeyManager to retrieve stored key

## Configuration

### Setting the Master Key

Add to your `.env` file:

```bash
# Generate a secure master key:
# node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"

WALRUS_MASTER_ENCRYPTION_KEY=0x1234567890abcdef...

# For web app (Vite):
VITE_WALRUS_MASTER_ENCRYPTION_KEY=0x1234567890abcdef...
```

**Important:** 
- Keep this key secret and secure
- Use the same key across all deployments
- Changing the key will make previously encrypted files inaccessible
- Consider using a secrets management system in production

### Development Default

If `WALRUS_MASTER_ENCRYPTION_KEY` is not set, the system uses a deterministic development key. This is **NOT SECURE** for production use but allows development and testing without configuration.

## API Changes

### EncryptionService (Node.js/CLI)

**New Methods:**

```typescript
// Get the master encryption key
EncryptionService.getMasterKey(): Buffer

// Hash user ID (wallet address)
EncryptionService.hashUserId(userId: string): Buffer

// Derive user-specific encryption key
EncryptionService.deriveUserKey(userId: string): Buffer

// Encrypt with user-specific key
EncryptionService.encryptWithUserKey(data: Buffer, userId: string): EncryptionResult

// Decrypt with user-specific key
EncryptionService.decryptWithUserKey(
  params: Omit<DecryptionParams, "key">,
  userId: string
): Buffer
```

### crypto.ts (Browser/Web UI)

**New Functions:**

```typescript
// Derive AES key from Master Key + User ID
async function deriveAesKeyFromMasterAndUserId(
  privateKeyHex: string,
  salt: Uint8Array
): Promise<CryptoKey>
```

**Updated:**
- `encryptToBlob()` - Now uses Master Key + User ID derivation
- `tryDecryptToBlob()` - Supports both new and legacy encryption methods

## Backward Compatibility

The system maintains backward compatibility with files encrypted using the old method:

- Download script detects encryption method from metadata
- If `keyDerivation: "master-user-hash"` → uses new derivation
- If legacy or missing → falls back to KeyManager
- Users can decrypt old files as long as they have the keystore

## Security Considerations

### Advantages

1. **Simplified Key Management**: Only one key to protect (Master Key)
2. **Deterministic Recovery**: Keys can be re-derived, no need for backups
3. **User Isolation**: Each user gets a unique key based on their wallet address
4. **No Cross-User Access**: Users cannot decrypt each other's files

### Considerations

1. **Master Key Protection**: The Master Key must be kept secret
2. **User ID Privacy**: Wallet addresses are public, but hashing provides some obscurity
3. **Key Rotation**: Changing the Master Key requires re-encrypting all files
4. **Shared Devices**: Same user on same device always gets same key

### Best Practices

1. Store Master Key in environment variables, not in code
2. Use different Master Keys for different environments (dev/staging/prod)
3. Consider using a secrets management system (AWS Secrets Manager, HashiCorp Vault)
4. Implement key rotation strategy if needed
5. Monitor and audit Master Key access

## Migration Guide

### For New Installations

Simply set `WALRUS_MASTER_ENCRYPTION_KEY` in your `.env` file. All encryption will use the new method automatically.

### For Existing Installations

Files encrypted with the old method will continue to work:

1. Set `WALRUS_MASTER_ENCRYPTION_KEY` in `.env`
2. New uploads will use the new encryption method
3. Old files will be decrypted using the keystore (backward compatibility)
4. Optionally: Re-upload old files to migrate them to the new encryption

### Re-encrypting Legacy Files

If you want to migrate old files to the new encryption method:

```bash
# Download the old file
npx tsx src/scripts/index.ts download <blob-id>

# Re-upload with new encryption
npx tsx src/scripts/index.ts upload <file> --encrypt
```

## Testing

Run the encryption tests:

```bash
cd client
npx tsx src/scripts/test-encryption.ts
```

Tests verify:
- ✅ Basic encryption/decryption
- ✅ Key determinism (same user = same key)
- ✅ User isolation (different users = different keys)
- ✅ Cross-user decryption fails
- ✅ Master key generation

## Future Enhancements

Potential improvements for future versions:

1. **Key Rotation**: Implement periodic Master Key rotation with re-encryption
2. **Multi-Factor Derivation**: Add additional factors (device ID, timestamp) for enhanced security
3. **Shared Access**: Implement key wrapping for sharing files between users
4. **Hardware Security Modules**: Support HSM-based master key storage
5. **Audit Logging**: Track encryption/decryption operations

## References

- [HKDF (RFC 5869)](https://tools.ietf.org/html/rfc5869)
- [AES-GCM (NIST SP 800-38D)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [Sui Cryptography](https://docs.sui.io/concepts/cryptography)
