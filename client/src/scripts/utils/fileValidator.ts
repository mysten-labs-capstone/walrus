import fs from "fs/promises";
import path from "path";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo: {
    name: string;
    size: number;
    type: string;
    extension: string;
  };
}

// Configuration
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MIN_FILE_SIZE = 1; // 1 byte

const ALLOWED_TYPES = [
  "text/plain",
  "application/json",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "application/zip",
  "application/x-tar",
];

const ALLOWED_EXTENSIONS = [
  ".txt", ".json", ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".mp4", ".webm", ".mp3", ".wav", ".zip", ".tar"
];

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export async function validateFile(filePath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    await fs.access(filePath);
  } catch {
    errors.push(`File not found: ${filePath}`);
    return {
      isValid: false,
      errors,
      warnings,
      fileInfo: {
        name: path.basename(filePath),
        size: 0,
        type: "unknown",
        extension: path.extname(filePath),
      },
    };
  }

  const stats = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = getMimeType(fileName);

  if (stats.size === 0) {
    errors.push("File is empty");
  } else if (stats.size < MIN_FILE_SIZE) {
    errors.push(`File is too small (minimum: ${MIN_FILE_SIZE} byte)`);
  } else if (stats.size > MAX_FILE_SIZE) {
    errors.push(
      `File is too large (maximum: ${formatBytes(MAX_FILE_SIZE)}, got: ${formatBytes(stats.size)})`
    );
  }

  // Validate file extension
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    warnings.push(
      `File extension '${extension}' may not be supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`
    );
  }
  // Validate content type
  if (!ALLOWED_TYPES.includes(contentType) && contentType !== "application/octet-stream") {
    warnings.push(
      `Content type '${contentType}' may not be fully supported`
    );
  }
  if (stats.isDirectory()) {
    errors.push("Path is a directory, not a file");
  }
  if (stats.size > 10 * 1024 * 1024) {
    warnings.push(
      `Large file detected (${formatBytes(stats.size)}). Upload may take longer.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fileInfo: {
      name: fileName,
      size: stats.size,
      type: contentType,
      extension,
    },
  };
}

export function printValidationResult(result: ValidationResult): void {
  // TODO: reduce console.log() especially for file names/paths
  console.log("─".repeat(50));
  console.log("File Validation");
  console.log("─".repeat(50));
  console.log(`Name: ${result.fileInfo.name}`);
  console.log(`Size: ${formatBytes(result.fileInfo.size)}`);
  console.log(`Type: ${result.fileInfo.type}`);
  console.log(`Extension: ${result.fileInfo.extension}`);

  if (result.warnings.length > 0) {
    console.log("\n⚠️ Warnings:");
    result.warnings.forEach((warning) => console.log(`   • ${warning}`));
  }

  if (result.errors.length > 0) {
    console.log("\n❌ Errors:");
    result.errors.forEach((error) => console.log(`   • ${error}`));
  }

  if (result.isValid) {
    console.log("\n[✔] Validation passed");
  } else {
    console.log("\n❌ Validation failed");
  }
  console.log("─".repeat(50) + "\n");
}