export interface CachedFile {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
  epochs?: number; // Storage duration in epochs (default: 3)
  status?: "pending" | "processing" | "completed" | "failed";
  s3Key?: string | null;
  folderId?: string | null;
  folderPath?: string | null; // e.g., "Documents/Projects"
  starred?: boolean;
}

const CACHE_KEY = "walrus_file_cache";

export function getCachedFiles(): CachedFile[] {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

export function addCachedFile(file: CachedFile): void {
  try {
    const files = getCachedFiles();
    // Prevent duplicates
    const exists = files.some((f) => f.blobId === file.blobId);
    if (!exists) {
      files.unshift(file); // Add to beginning
      // Keep only last 50 files
      const trimmed = files.slice(0, 50);
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    }
  } catch (error) {
    console.error("Failed to cache file:", error);
  }
}

export function removeCachedFile(blobId: string): void {
  try {
    const files = getCachedFiles();
    const filtered = files.filter((f) => f.blobId !== blobId);
    localStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Failed to remove cached file:", error);
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Failed to clear cache:", error);
  }
}
