import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fromIni } from '@aws-sdk/credential-providers';

interface S3Config {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

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
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const roleArn = process.env.AWS_ROLE_ARN;
    const profile = process.env.AWS_PROFILE; // e.g., 'default' or custom profile name

    if (!region || !bucket) {
      console.warn('[S3Service] S3 not configured - set AWS_REGION and AWS_S3_BUCKET');
      this.enabled = false;
      return;
    }

    this.bucket = bucket;
    
    // Priority order: AWS Profile (local dev) > Access Keys > IAM Role (Vercel/AWS)
    try {
      if (profile) {
        // Use AWS CLI profile (supports AssumeRole configured in ~/.aws/config)
        console.log(`[S3Service] Using AWS profile: ${profile}`);
        this.client = new S3Client({
          region,
          credentials: fromIni({ profile }),
        });
      } else if (accessKeyId && secretAccessKey) {
        console.log(`[S3Service] Using access key authentication`);
        this.client = new S3Client({
          region,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
      } else {
        console.log(`[S3Service] Using default credential chain (IAM role from environment)`);
        // No explicit credentials - will use default credential chain
        // Works on EC2, ECS, Lambda, Vercel with IAM integration
        this.client = new S3Client({
          region,
        });
      }
      
      this.enabled = true;
      console.log(`[S3Service] Initialized with bucket: ${bucket}, region: ${region}`);
    } catch (err: any) {
      console.error(`[S3Service] Failed to initialize:`, err.message);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Upload a file to S3
   * @param key - S3 object key (e.g., "uploads/user123/file.bin")
   * @param data - File data as Buffer or Uint8Array
   * @param metadata - Optional metadata to store with the object
   * @returns S3 object URL
   */
  async upload(key: string, data: Buffer | Uint8Array, metadata?: Record<string, string>): Promise<string> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }

    console.log(`[S3Service] Uploading to s3://${this.bucket}/${key} (${data.length} bytes)`);
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      Metadata: metadata,
      ContentType: metadata?.contentType || 'application/octet-stream',
    });

    await this.client.send(command);
    const url = `s3://${this.bucket}/${key}`;
    console.log(`[S3Service] Upload complete: ${url}`);
    return url;
  }

  /**
   * Download a file from S3
   * @param key - S3 object key
   * @returns File data as Buffer
   */
  async download(key: string): Promise<Buffer> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }

    console.log(`[S3Service] Downloading from s3://${this.bucket}/${key}`);

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
    console.log(`[S3Service] Downloaded ${buffer.length} bytes`);
    return buffer;
  }

  /**
   * Delete a file from S3
   * @param key - S3 object key
   */
  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }

    console.log(`[S3Service] Deleting s3://${this.bucket}/${key}`);

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
   * Generate S3 key for a file
   * @param userId - User ID
   * @param blobId - Blob ID (or temp ID)
   * @param filename - Original filename
   * @returns S3 object key
   */
  generateKey(userId: string, blobId: string, filename: string): string {
    // Use blob ID as primary identifier
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `uploads/${userId}/${blobId}/${sanitizedFilename}`;
  }

  /**
   * Generate a presigned URL for direct client upload to S3
   * @param key - S3 object key
   * @param options - Upload options (contentType, metadata, expiresIn seconds)
   * @returns Presigned upload URL
   */
  async getPresignedUploadUrl(
    key: string,
    options: {
      contentType?: string;
      metadata?: Record<string, string>;
      expiresIn?: number;
    } = {}
  ): Promise<string> {
    if (!this.enabled || !this.client) {
      throw new Error('S3 service not enabled');
    }

    const { contentType = 'application/octet-stream', metadata = {}, expiresIn = 600 } = options;

    console.log(`[S3Service] Generating presigned URL for s3://${this.bucket}/${key} (expires in ${expiresIn}s)`);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: metadata,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    console.log(`[S3Service] Presigned URL generated`);
    return url;
  }
}

export const s3Service = new S3Service();
