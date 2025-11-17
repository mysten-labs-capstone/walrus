import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface FileMetadata {
  blobId: string;
  passwordHash: string;
  salt: string;
  filename?: string;
  uploadedAt: number;
}

// Simple JSON-based storage (for production, use a proper database)
const METADATA_FILE = path.join(process.cwd(), '.file-metadata.json');

async function ensureMetadataFile() {
  try {
    await fs.access(METADATA_FILE);
  } catch {
    await fs.writeFile(METADATA_FILE, JSON.stringify({}));
  }
}

async function readMetadata(): Promise<Record<string, FileMetadata>> {
  await ensureMetadataFile();
  const data = await fs.readFile(METADATA_FILE, 'utf-8');
  return JSON.parse(data);
}

async function writeMetadata(metadata: Record<string, FileMetadata>) {
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

export function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function storeFileMetadata(
  blobId: string,
  password: string,
  filename?: string
): Promise<void> {
  const metadata = await readMetadata();
  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);

  metadata[blobId] = {
    blobId,
    passwordHash,
    salt,
    filename,
    uploadedAt: Date.now(),
  };

  await writeMetadata(metadata);
}

export async function verifyFilePassword(
  blobId: string,
  password: string
): Promise<boolean> {
  const metadata = await readMetadata();
  const fileData = metadata[blobId];

  if (!fileData) {
    return false; // File not found - might be unprotected
  }

  const hash = hashPassword(password, fileData.salt);
  return hash === fileData.passwordHash;
}

export async function isFileProtected(blobId: string): Promise<boolean> {
  const metadata = await readMetadata();
  return blobId in metadata;
}

export async function getFileMetadata(blobId: string): Promise<FileMetadata | null> {
  const metadata = await readMetadata();
  return metadata[blobId] || null;
}
