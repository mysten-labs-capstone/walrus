import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import prisma from '../app/api/_utils/prisma';

export class CacheService {
  private cacheDir: string;
  private maxCacheSize: number; // in bytes
  private maxCacheAge: number; // in milliseconds
  public prisma = prisma; // Expose prisma client for database queries

  constructor(
    cacheDir?: string,
    maxCacheSize: number = 5 * 1024 * 1024 * 1024, // 5GB default
    maxCacheAge: number = 7 * 24 * 60 * 60 * 1000 // 7 days default
  ) {
    // Use database-only tracking for file metadata
    this.cacheDir = cacheDir || (process.env.VERCEL 
      ? '' // Disabled on Vercel
      : path.join(process.cwd(), '.cache', 'blobs')); // Local dev only
    this.maxCacheSize = maxCacheSize;
    this.maxCacheAge = maxCacheAge;
  }

  async init(): Promise<void> {
    // Skip cache dir creation on Vercel
    if (process.env.VERCEL || !this.cacheDir) {
      console.log(`[Cache] File caching disabled (serverless environment)`);
      return;
    }
    
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      console.log(`[Cache] Initialized at: ${this.cacheDir}`);
    } catch (err) {
      console.error(`[Cache] Failed to initialize cache directory:`, err);
      // Don't throw - allow the service to continue without caching
    }
  }

  /**
   * Generate a cache key for a blob
   */
  private getCacheKey(blobId: string, userId: string): string {
    const hash = crypto.createHash('sha256')
      .update(`${userId}:${blobId}`)
      .digest('hex');
    return path.join(this.cacheDir, hash.slice(0, 2), hash);
  }

  /**
   * Check if blob is cached
   */
  async isCached(blobId: string, userId: string): Promise<boolean> {
    // On Vercel, file caching is disabled - always return false
    if (process.env.VERCEL || !this.cacheDir) {
      return false;
    }
    
    const cacheKey = this.getCacheKey(blobId, userId);
    try {
      await fs.access(cacheKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached blob
   */
  async get(blobId: string, userId: string): Promise<Buffer | null> {
    // On Vercel, file caching is disabled - always return null
    if (process.env.VERCEL || !this.cacheDir) {
      return null;
    }
    
    const cacheKey = this.getCacheKey(blobId, userId);
    
    try {
      const data = await fs.readFile(cacheKey);
      
      // Update last accessed time in database
      await prisma.file.updateMany({
        where: { blobId, userId },
        data: { lastAccessedAt: new Date() }
      });
      
      console.log(`[Cache] HIT: ${blobId} for user ${userId}`);
      return data;
    } catch (err) {
      console.log(`[Cache] MISS: ${blobId} for user ${userId}`);
      return null;
    }
  }

  /**
   * Store blob in cache
   */
  async set(
    blobId: string, 
    userId: string, 
    data: Buffer,
    metadata?: {
      filename?: string;
      originalSize?: number;
      contentType?: string;
      encrypted?: boolean;
      userKeyEncrypted?: boolean;
      masterKeyEncrypted?: boolean;
      blobObjectId?: string | null;
    }
  ): Promise<void> {
    // Always update database record for tracking
    const now = new Date();
    try {
      await prisma.file.upsert({
        where: { blobId },
        create: {
          blobId,
          blobObjectId: metadata?.blobObjectId || null,
          userId,
          encryptedUserId: await this.encryptUserId(userId),
          filename: metadata?.filename || blobId,
          originalSize: metadata?.originalSize || data.length,
          contentType: metadata?.contentType || 'application/octet-stream',
          encrypted: metadata?.encrypted || false,
          userKeyEncrypted: metadata?.userKeyEncrypted || false,
          masterKeyEncrypted: metadata?.masterKeyEncrypted || false,
          cached: false, // File caching disabled on Vercel
          cacheKey: null,
          cacheSize: null,
          uploadedAt: now,
          lastAccessedAt: now,
          cachedAt: null,
        },
        update: {
          cached: false,
          cacheKey: null,
          cacheSize: null,
          lastAccessedAt: now,
        }
      });
      
      console.log(`[Cache] DB record updated for ${blobId} (file caching disabled on Vercel)`);
    } catch (err) {
      console.error(`[Cache] Failed to update DB record for ${blobId}:`, err);
    }

    // Skip file caching on Vercel
    if (process.env.VERCEL || !this.cacheDir) {
      return;
    }

    // Local development: use file cache
    const cacheKey = this.getCacheKey(blobId, userId);
    const cacheDir = path.dirname(cacheKey);
    
    try {
      // Ensure directory exists
      await fs.mkdir(cacheDir, { recursive: true });
      
      // Write file
      await fs.writeFile(cacheKey, data);
      
      // Update database record
      await prisma.file.updateMany({
        where: { blobId, userId },
        data: {
          cached: true,
          cacheKey,
          cacheSize: data.length,
          cachedAt: now,
        }
      });
      
      console.log(`[Cache] STORED: ${blobId} for user ${userId} (${data.length} bytes)`);
      
      // Clean up old cache if needed
      await this.cleanup();
    } catch (err) {
      console.error(`[Cache] Failed to cache ${blobId}:`, err);
      // Don't throw - allow upload to succeed without caching
    }
  }

  /**
   * Delete cached blob
   */
  async delete(blobId: string, userId: string): Promise<void> {
    const cacheKey = this.getCacheKey(blobId, userId);
    
    try {
      await fs.unlink(cacheKey);
      
      // Update database
      await prisma.file.updateMany({
        where: { blobId, userId },
        data: { 
          cached: false, 
          cacheKey: null, 
          cacheSize: null,
          cachedAt: null 
        }
      });
      
      console.log(`[Cache] DELETED: ${blobId}`);
    } catch (err) {
      console.warn(`[Cache] Failed to delete ${blobId}:`, err);
    }
  }

  /**
   * Get total cache size
   */
  async getCacheSize(): Promise<number> {
    const result = await prisma.file.aggregate({
      where: { cached: true },
      _sum: { cacheSize: true }
    });
    return result._sum.cacheSize || 0;
  }

  /**
   * Clean up old cache entries
   */
  async cleanup(): Promise<void> {
    const totalSize = await this.getCacheSize();
    
    if (totalSize <= this.maxCacheSize) {
      return;
    }
    
    console.log(`[Cache] Cleanup triggered. Current size: ${totalSize}, Max: ${this.maxCacheSize}`);
    
    // Get oldest cached files
    const oldFiles = await prisma.file.findMany({
      where: { cached: true },
      orderBy: { lastAccessedAt: 'asc' },
      take: 50 // Delete up to 50 oldest files
    });
    
    for (const file of oldFiles) {
      if (file.cacheKey) {
        try {
          await fs.unlink(file.cacheKey);
          await prisma.file.update({
            where: { id: file.id },
            data: { 
              cached: false, 
              cacheKey: null, 
              cacheSize: null,
              cachedAt: null 
            }
          });
        } catch (err) {
          console.warn(`[Cache] Failed to cleanup ${file.blobId}:`, err);
        }
      }
      
      const newSize = await this.getCacheSize();
      if (newSize <= this.maxCacheSize * 0.8) {
        break; // Stop when we're under 80% capacity
      }
    }
  }

  /**
   * Get user's cached files
   */
  async getUserFiles(userId: string): Promise<any[]> {
    return prisma.file.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        blobId: true,
        filename: true,
        originalSize: true,
        contentType: true,
        encrypted: true,
        cached: true,
        epochs: true,
        uploadedAt: true,
        lastAccessedAt: true,
      }
    });
  }

  /**
   * Encrypt user ID for master wallet file association
   */
  private async encryptUserId(userId: string): Promise<string> {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('MASTER_ENCRYPTION_KEY not configured');
    }
    
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(masterKey, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(userId, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');
    
    return `${encrypted}:${authTag}:${ivHex}`;
  }

  /**
   * Decrypt user ID
   */
  async decryptUserId(encryptedUserId: string): Promise<string> {
    const masterKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKey) {
      throw new Error('MASTER_ENCRYPTION_KEY not configured');
    }
    
    const [encrypted, authTag, ivHex] = encryptedUserId.split(':');
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(masterKey, 'hex'),
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Singleton instance
export const cacheService = new CacheService();