// client/src/scripts/utils/encryptionService.ts
import crypto from "crypto";

export interface EncryptionResult {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  key: Buffer;
}

export interface DecryptionParams {
  encryptedData: Buffer;
  iv: Buffer;
  authTag: Buffer;
  key: Buffer;
}

export interface EncryptionMetadata {
  iv: string; // base64 encoded
  authTag: string; // base64 encoded
  algorithm: "aes-256-gcm";
  keyDerivation: "none" | "pbkdf2" | "master-user-hash"; // Key derivation method
}

/**
 * AES-GCM Encryption Service
 * Provides transparent encryption/decryption for file uploads/downloads
 * 
 * New key derivation approach:
 * - Uses Master Encryption Key (application-wide)
 * - Combines with User ID Hash (from wallet address)
 * - Eliminates need for per-file key storage
 */
export class EncryptionService {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private static readonly MASTER_KEY_ENV = "WALRUS_MASTER_ENCRYPTION_KEY";

  /**
   * Generate a random encryption key
   */
  static generateKey(): Buffer {
    return crypto.randomBytes(this.KEY_LENGTH);
  }

  /**
   * Generate a random initialization vector
   */
  static generateIV(): Buffer {
    return crypto.randomBytes(this.IV_LENGTH);
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param data - Data to encrypt
   * @param key - Optional encryption key (generates one if not provided)
   * @returns Encryption result with encrypted data, IV, auth tag, and key
   */
  static encrypt(data: Buffer, key?: Buffer): EncryptionResult {
    const encryptionKey = key || this.generateKey();
    const iv = this.generateIV();

    const cipher = crypto.createCipheriv(this.ALGORITHM, encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted,
      iv,
      authTag,
      key: encryptionKey,
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param params - Decryption parameters
   * @returns Decrypted data
   */
  static decrypt(params: DecryptionParams): Buffer {
    const decipher = crypto.createDecipheriv(
      this.ALGORITHM,
      params.key,
      params.iv
    );

    decipher.setAuthTag(params.authTag);

    const decrypted = Buffer.concat([
      decipher.update(params.encryptedData),
      decipher.final(),
    ]);

    return decrypted;
  }

  /**
   * Create encryption metadata for storage
   */
  static createMetadata(
    iv: Buffer,
    authTag: Buffer
  ): EncryptionMetadata {
    return {
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      algorithm: this.ALGORITHM,
      keyDerivation: "none",
    };
  }

  /**
   * Parse encryption metadata from storage
   */
  static parseMetadata(metadata: EncryptionMetadata): {
    iv: Buffer;
    authTag: Buffer;
  } {
    return {
      iv: Buffer.from(metadata.iv, "base64"),
      authTag: Buffer.from(metadata.authTag, "base64"),
    };
  }

  /**
   * Export encryption key as base64 string for storage
   */
  static exportKey(key: Buffer): string {
    return key.toString("base64");
  }

  /**
   * Import encryption key from base64 string
   */
  static importKey(keyString: string): Buffer {
    return Buffer.from(keyString, "base64");
  }

  /**
   * Derive key from password (for future password-based encryption)
   */
  static deriveKeyFromPassword(
    password: string,
    salt: Buffer,
    iterations: number = 100000
  ): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      this.KEY_LENGTH,
      "sha256"
    );
  }

  /**
   * Verify encryption integrity
   */
  static verifyIntegrity(
    encryptedData: Buffer,
    iv: Buffer,
    authTag: Buffer,
    key: Buffer
  ): boolean {
    try {
      this.decrypt({ encryptedData, iv, authTag, key });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or generate the master encryption key
   * This is an application-wide key stored in environment variables
   */
  static getMasterKey(): Buffer {
    const masterKeyHex = process.env[this.MASTER_KEY_ENV];
    
    if (masterKeyHex) {
      // Use existing master key from environment
      return Buffer.from(masterKeyHex.replace(/^0x/, ""), "hex");
    }
    
    // For development: generate a deterministic master key
    // In production, this should be set in .env
    console.warn(`⚠️  ${this.MASTER_KEY_ENV} not set, using development default`);
    console.warn(`   Set ${this.MASTER_KEY_ENV} in .env for production use`);
    
    // Use a deterministic development key (DO NOT use in production)
    const devKey = "walrus-dev-master-key-change-in-production-0123456789abcdef";
    return crypto.createHash("sha256").update(devKey).digest();
  }

  /**
   * Hash user ID (wallet address) to create user-specific key material
   * @param userId - User's wallet address (Sui address)
   * @returns Hashed user key material
   */
  static hashUserId(userId: string): Buffer {
    return crypto.createHash("sha256").update(userId).digest();
  }

  /**
   * Derive encryption key from Master Key + User ID
   * @param userId - User's wallet address
   * @returns Derived encryption key
   */
  static deriveUserKey(userId: string): Buffer {
    const masterKey = this.getMasterKey();
    const userIdHash = this.hashUserId(userId);
    
    // Combine master key and user ID hash using HKDF
    // This creates a unique key per user while maintaining determinism
    return Buffer.from(
      crypto.hkdfSync(
        "sha256",
        Buffer.concat([masterKey, userIdHash]),
        Buffer.alloc(0), // no salt needed as we're combining two keys
        "walrus-file-encryption", // info/context string
        this.KEY_LENGTH
      )
    );
  }

  /**
   * Encrypt data using Master Key + User ID derivation
   * @param data - Data to encrypt
   * @param userId - User's wallet address
   * @returns Encryption result
   */
  static encryptWithUserKey(data: Buffer, userId: string): EncryptionResult {
    const key = this.deriveUserKey(userId);
    return this.encrypt(data, key);
  }

  /**
   * Decrypt data using Master Key + User ID derivation
   * @param params - Decryption parameters (without key)
   * @param userId - User's wallet address
   * @returns Decrypted data
   */
  static decryptWithUserKey(
    params: Omit<DecryptionParams, "key">,
    userId: string
  ): Buffer {
    const key = this.deriveUserKey(userId);
    return this.decrypt({ ...params, key });
  }
}