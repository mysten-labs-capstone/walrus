import crypto from 'crypto';

/**
 * Dual encryption service supporting both user private key and master backup key
 */
export class EncryptionService {
  private masterKey: Buffer;
  
  constructor() {
    const masterKeyHex = process.env.MASTER_ENCRYPTION_KEY;
    if (!masterKeyHex || masterKeyHex.length !== 64) {
      throw new Error('MASTER_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Encrypt data with user's private key using HKDF + AES-GCM
   */
  async encryptWithUserKey(
    data: Buffer,
    userPrivateKeyHex: string
  ): Promise<{
    encrypted: Buffer;
    salt: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }> {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    
    // Derive AES key from user's private key using HKDF
    const aesKey = Buffer.from(crypto.hkdfSync(
      'sha256',
      Buffer.from(userPrivateKeyHex.replace(/^0x/, ''), 'hex'),
      salt,
      Buffer.alloc(0),
      32
    ));
    
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return { encrypted, salt, iv, authTag };
  }

  /**
   * Decrypt data with user's private key
   */
  async decryptWithUserKey(
    encrypted: Buffer,
    userPrivateKeyHex: string,
    salt: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    // Derive same AES key
    const aesKey = Buffer.from(crypto.hkdfSync(
      'sha256',
      Buffer.from(userPrivateKeyHex.replace(/^0x/, ''), 'hex'),
      salt,
      Buffer.alloc(0),
      32
    ));
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Encrypt data with master backup key
   */
  async encryptWithMasterKey(data: Buffer): Promise<{
    encrypted: Buffer;
    iv: Buffer;
    authTag: Buffer;
  }> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return { encrypted, iv, authTag };
  }

  /**
   * Decrypt data with master backup key
   */
  async decryptWithMasterKey(
    encrypted: Buffer,
    iv: Buffer,
    authTag: Buffer
  ): Promise<Buffer> {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Double encrypt: first with user key, then with master key
   */
  async doubleEncrypt(
    data: Buffer,
    userPrivateKeyHex: string
  ): Promise<{
    encrypted: Buffer;
    userSalt: Buffer;
    userIv: Buffer;
    userAuthTag: Buffer;
    masterIv: Buffer;
    masterAuthTag: Buffer;
  }> {
    // First layer: user key
    const userEncrypted = await this.encryptWithUserKey(data, userPrivateKeyHex);
    
    // Second layer: master key on top of user-encrypted data
    const masterEncrypted = await this.encryptWithMasterKey(userEncrypted.encrypted);
    
    return {
      encrypted: masterEncrypted.encrypted,
      userSalt: userEncrypted.salt,
      userIv: userEncrypted.iv,
      userAuthTag: userEncrypted.authTag,
      masterIv: masterEncrypted.iv,
      masterAuthTag: masterEncrypted.authTag,
    };
  }

  /**
   * Double decrypt: first with master key, then with user key
   */
  async doubleDecrypt(
    encrypted: Buffer,
    userPrivateKeyHex: string,
    userSalt: Buffer,
    userIv: Buffer,
    userAuthTag: Buffer,
    masterIv: Buffer,
    masterAuthTag: Buffer
  ): Promise<Buffer> {
    // First layer: decrypt with master key
    const userEncrypted = await this.decryptWithMasterKey(
      encrypted,
      masterIv,
      masterAuthTag
    );
    
    // Second layer: decrypt with user key
    return this.decryptWithUserKey(
      userEncrypted,
      userPrivateKeyHex,
      userSalt,
      userIv,
      userAuthTag
    );
  }

  /**
   * Create encryption metadata header
   */
  createMetadataHeader(params: {
    userSalt?: Buffer;
    userIv?: Buffer;
    userAuthTag?: Buffer;
    masterIv?: Buffer;
    masterAuthTag?: Buffer;
    originalFilename: string;
  }): Buffer {
    const metadata = {
      version: 1,
      userSalt: params.userSalt?.toString('base64'),
      userIv: params.userIv?.toString('base64'),
      userAuthTag: params.userAuthTag?.toString('base64'),
      masterIv: params.masterIv?.toString('base64'),
      masterAuthTag: params.masterAuthTag?.toString('base64'),
      filename: params.originalFilename,
    };
    
    const jsonStr = JSON.stringify(metadata);
    const jsonBuf = Buffer.from(jsonStr, 'utf8');
    const headerLen = Buffer.alloc(4);
    headerLen.writeUInt32BE(jsonBuf.length, 0);
    
    return Buffer.concat([headerLen, jsonBuf]);
  }

  /**
   * Parse encryption metadata header
   */
  parseMetadataHeader(data: Buffer): {
    metadata: any;
    dataStart: number;
  } {
    const headerLen = data.readUInt32BE(0);
    const jsonBuf = data.subarray(4, 4 + headerLen);
    const metadata = JSON.parse(jsonBuf.toString('utf8'));
    
    return {
      metadata,
      dataStart: 4 + headerLen,
    };
  }
}

// Singleton instance
export const encryptionService = new EncryptionService();
