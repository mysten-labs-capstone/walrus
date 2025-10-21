// client/src/scripts/utils/keyManager.ts
import fs from "fs/promises";
import path from "path";
import { EncryptionService } from "./encryptionService.js";

export interface KeyRecord {
  blobId: string;
  key: string; // base64 encoded encryption key
  createdAt: string;
  fileName: string;
}

const KEYSTORE_FILE = ".walrus-keystore.json";

/**
 * Secure key management for encrypted uploads
 * Stores encryption keys locally for later decryption
 */
export class KeyManager {
  private keystorePath: string;

  constructor(keystorePath: string = KEYSTORE_FILE) {
    this.keystorePath = keystorePath;
  }

  /**
   * Load all key records from keystore
   */
  private async loadKeystore(): Promise<KeyRecord[]> {
    try {
      const data = await fs.readFile(this.keystorePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Save key records to keystore
   */
  private async saveKeystore(records: KeyRecord[]): Promise<void> {
    await fs.writeFile(
      this.keystorePath,
      JSON.stringify(records, null, 2),
      "utf-8"
    );
  }

  /**
   * Store encryption key for a blob
   */
  async storeKey(
    blobId: string,
    key: Buffer,
    fileName: string
  ): Promise<void> {
    const records = await this.loadKeystore();
    
    const record: KeyRecord = {
      blobId,
      key: EncryptionService.exportKey(key),
      createdAt: new Date().toISOString(),
      fileName,
    };

    // Remove old record if it exists
    const filtered = records.filter((r) => r.blobId !== blobId);
    filtered.push(record);

    await this.saveKeystore(filtered);
  }

  /**
   * Retrieve encryption key for a blob
   */
  async getKey(blobId: string): Promise<Buffer | null> {
    const records = await this.loadKeystore();
    const record = records.find((r) => r.blobId === blobId);
    
    if (!record) {
      return null;
    }

    return EncryptionService.importKey(record.key);
  }

  /**
   * Get key record with metadata
   */
  async getKeyRecord(blobId: string): Promise<KeyRecord | null> {
    const records = await this.loadKeystore();
    return records.find((r) => r.blobId === blobId) || null;
  }

  /**
   * Delete encryption key for a blob
   */
  async deleteKey(blobId: string): Promise<boolean> {
    const records = await this.loadKeystore();
    const filtered = records.filter((r) => r.blobId !== blobId);
    
    if (filtered.length === records.length) {
      return false; // Key not found
    }

    await this.saveKeystore(filtered);
    return true;
  }

  /**
   * List all stored keys
   */
  async listKeys(): Promise<KeyRecord[]> {
    return this.loadKeystore();
  }

  /**
   * Check if key exists for blob
   */
  async hasKey(blobId: string): Promise<boolean> {
    const key = await this.getKey(blobId);
    return key !== null;
  }

  /**
   * Export key to file for backup
   */
  async exportKey(blobId: string, outputPath: string): Promise<void> {
    const record = await this.getKeyRecord(blobId);
    
    if (!record) {
      throw new Error(`No key found for blob ${blobId}`);
    }

    await fs.writeFile(
      outputPath,
      JSON.stringify(record, null, 2),
      "utf-8"
    );
  }

  /**
   * Import key from file
   */
  async importKey(keyFilePath: string): Promise<void> {
    const data = await fs.readFile(keyFilePath, "utf-8");
    const record: KeyRecord = JSON.parse(data);
    
    const records = await this.loadKeystore();
    const filtered = records.filter((r) => r.blobId !== record.blobId);
    filtered.push(record);
    
    await this.saveKeystore(filtered);
  }

  /**
   * Get keystore file path
   */
  getKeystorePath(): string {
    return path.resolve(this.keystorePath);
  }
}