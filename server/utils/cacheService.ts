// Cache layer removed. Provide a lightweight stub to avoid breaking imports.
import prisma from "../app/api/_utils/prisma";
import crypto from "crypto";

export const cacheService = {
  prisma,
  async init(): Promise<void> {
    // no-op
  },
  async isCached(_blobId: string, _userId: string): Promise<boolean> {
    return false;
  },
  async set(
    _blobId: string,
    _userId: string,
    _data: Buffer,
    _metadata?: {
      filename?: string;
      originalSize?: number;
      contentType?: string;
      encrypted?: boolean;
      userKeyEncrypted?: boolean;
      masterKeyEncrypted?: boolean;
      blobObjectId?: string | null;
      epochs?: number;
    },
  ): Promise<void> {
    // no-op
  },
  async delete(_blobId: string, _userId: string): Promise<void> {
    // no-op
  },
  async getCacheSize(): Promise<number> {
    return 0;
  },
  async getUserFiles(_userId: string): Promise<any[]> {
    return [];
  },
  async cleanup(): Promise<void> {
    // no-op
  },
  async encryptUserId(userId: string): Promise<string> {
    // Simple deterministic hash for privacy without encryption
    return crypto.createHash("sha256").update(userId).digest("hex");
  },
};
