import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';

class S3Service {
  private client: S3Client | null = null;
  private bucket: string = '';
  private enabled: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    const profile = process.env.AWS_PROFILE;
    if (!region || !bucket) {
      console.warn('[S3Service] S3 not configured - set AWS_REGION and AWS_S3_BUCKET');
      this.enabled = false;
      return;
    }

    this.bucket = bucket;

    // TODO: temporary improvement - prefer explicit env credentials for cloud previews
    // Use AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY if available, else fall back to
    // AWS_PROFILE (fromIni), else create client without explicit credentials so
    // the SDK can use the default provider chain (instance role, env, shared file).
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const sessionToken = process.env.AWS_SESSION_TOKEN;

    try {
      if (accessKey && secretKey) {
        this.client = new S3Client({
          region,
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            sessionToken,
          },
        });
        this.enabled = true;
        return;
      }

      if (profile) {
        try {
          // fromIni is lazy, so we create the client but it will fail on first use if profile doesn't exist
          // We'll catch that error in the upload/download methods
          this.client = new S3Client({
            region,
            credentials: fromIni({ profile }),
          });
          this.enabled = true;
          return;
        } catch (err: any) {
          console.warn(`[S3Service] Failed to initialize with profile "${profile}": ${err.message}`);
          console.warn(`[S3Service] Falling back to default credential provider chain`);
          // Fall through to default provider chain
        }
      }

      // No explicit creds provided; rely on SDK default provider chain (roles, env, shared)
      this.client = new S3Client({ region });
      this.enabled = true;
    } catch (err: any) {
      console.error(`[S3Service] Failed to initialize S3 client:`, err.message);
      console.error(`[S3Service] Make sure AWS credentials/config are properly configured in the environment`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Upload a file to S3
   * @param key - S3 object key (e.g., "username/blobId/file.bin")
   * @param data - File data as Buffer or Uint8Array
   * @param metadata - Optional metadata to store with the object
   * @returns S3 object URL
   */
  async upload(key: string, data: Buffer | Uint8Array, metadata?: Record<string, string>): Promise<string> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }
    
    const sanitize = (v: string) => {
      return v.replace(/[\x00-\x1F\x7F-\uFFFF]+/g, '_');
    };

    const safeMetadata: Record<string, string> | undefined = metadata
      ? Object.fromEntries(
          Object.entries(metadata).map(([k, v]) => [k, sanitize(String(v))])
        )
      : undefined;

    // Add expiration timestamp to metadata (14 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);
    const enhancedMetadata = {
      ...safeMetadata,
      'expires-at': expiresAt.toISOString(),
      'uploaded-at': new Date().toISOString(),
    };

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      Metadata: enhancedMetadata,
      ContentType: safeMetadata?.contentType || 'application/octet-stream',
      // Add tagging for lifecycle management
      Tagging: 'lifecycle=temporary',
    });

    try {
      await this.client.send(command);
    } catch (err: any) {
      // Handle credential errors gracefully
      if (err?.message?.includes('Could not resolve credentials') || 
          err?.message?.includes('profile') ||
          err?.name === 'CredentialsProviderError') {
        console.warn(`[S3Service] Credential error during upload: ${err.message}`);
        console.warn(`[S3Service] S3 upload disabled - file will be uploaded directly to Walrus`);
        // Disable S3 and throw a more user-friendly error
        this.enabled = false;
        throw new Error('S3 credentials not available. File will be uploaded directly to Walrus storage.');
      }
      // TODO: temporary verbose logging for S3 upload failures - remove after debugging
      console.error(`[S3Service] Upload failed:`, err);
      if (err?.name) console.error(`[S3Service] Upload error name: ${err.name}`);
      if (err?.message) console.error(`[S3Service] Upload error message: ${err.message}`);
      if (err?.$metadata) console.error('[S3Service] Upload $metadata:', err.$metadata);
      if (err?.stack) console.error(err.stack);
      throw err;
    }
    const url = `s3://${this.bucket}/${key}`;
    return url;
  }

  /**
   * Download a file from S3 and reset its expiration
   * @param key - S3 object key
   * @returns File data as Buffer
   */
  async download(key: string): Promise<Buffer> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    
    if (!response.Body) {
      throw new Error('Empty response from S3');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    
    const buffer = Buffer.concat(chunks);
    // Reset expiration to 14 days from NOW
    // Reset expiration asynchronously so downloads return quickly and don't block
    // the request on a potentially slow CopyObject operation.
    // TODO: keep this asynchronous unless you need strict metadata update ordering.
    void this.resetExpiration(key, response.Metadata)
      .then(() => console.log(`[S3Service] Reset expiration for ${key} to 14 days from now`))
      .catch((err) => console.warn(`[S3Service] Failed to reset expiration (non-fatal):`, err));

    return buffer;
  }

  /**
   * Reset the expiration of a file to 14 days from now
   * This is called on every download to keep popular files in S3
   * @param key - S3 object key
   * @param existingMetadata - Current object metadata
   */
  private async resetExpiration(key: string, existingMetadata?: Record<string, string>): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    // Calculate new expiration (14 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    // Update metadata with new expiration
    const updatedMetadata = {
      ...existingMetadata,
      'expires-at': expiresAt.toISOString(),
      'last-accessed-at': new Date().toISOString(),
    };

    // Copy object to itself with updated metadata (S3's way of updating metadata)
    const copyCommand = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${key}`,
      Key: key,
      Metadata: updatedMetadata,
      MetadataDirective: 'REPLACE',
      TaggingDirective: 'COPY',
    });

    await this.client.send(copyCommand);
  }

  /**
   * Delete a file from S3
   * @param key - S3 object key
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    console.log(`[S3Service] Deleted successfully`);
  }

  /**
   * Check if a file exists in S3
   * @param key - S3 object key
   * @returns true if exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Generate S3 key for a file using NEW structure
   * NEW: username/blobId/filename
   * OLD: uploads/userId-hash/temp_blobId/filename
   * 
   * @param username - User's actual username (not hashed ID)
   * @param blobId - Blob ID (WITHOUT "temp_" prefix)
   * @param filename - Original filename
   * @returns S3 object key
   */
  generateKey(username: string, blobId: string, filename: string): string {
    // Sanitize inputs for S3 key safety
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9._-]/g, '_');
    const sanitizedBlobId = blobId.replace(/^temp_/, ''); // Remove temp_ prefix if present
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // NEW structure: username/blobId/filename
    return `${sanitizedUsername}/${sanitizedBlobId}/${sanitizedFilename}`;
  }

  /**
   * MIGRATION HELPER: Convert old S3 key format to new format
   * This helps migrate existing files from old structure to new structure
   * 
   * @param oldKey - Old key format (uploads/userId-hash/temp_blobId/filename)
   * @param username - User's actual username
   * @returns New key format (username/blobId/filename)
   */
  migrateKey(oldKey: string, username: string): string {
    // Extract filename from old key
    const parts = oldKey.split('/');
    const filename = parts[parts.length - 1];
    
    // Extract blobId (remove temp_ prefix if present)
    const oldBlobId = parts[parts.length - 2];
    const blobId = oldBlobId.replace(/^temp_/, '');
    
    // Generate new key
    return this.generateKey(username, blobId, filename);
  }
}

export const s3Service = new S3Service();