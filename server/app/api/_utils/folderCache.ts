export type FlatFolder = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  createdAt: Date;
  fileCount: number;
  childCount: number;
};

export type FolderTreeNode = FlatFolder & {
  children: FolderTreeNode[];
};

type FolderCacheEntry = {
  expiresAt: number;
  tree?: FolderTreeNode[];
  flat?: FlatFolder[];
};

const CACHE_TTL_MS = 5000;
const folderCache = new Map<string, FolderCacheEntry>();

const getValidEntry = (userId: string): FolderCacheEntry | null => {
  const entry = folderCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    folderCache.delete(userId);
    return null;
  }
  return entry;
};

export const FOLDER_CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);

export const getFolderTreeCache = (userId: string): FolderTreeNode[] | null => {
  const entry = getValidEntry(userId);
  return entry?.tree ?? null;
};

export const getFolderFlatCache = (userId: string): FlatFolder[] | null => {
  const entry = getValidEntry(userId);
  return entry?.flat ?? null;
};

export const updateFolderCache = (
  userId: string,
  patch: Pick<FolderCacheEntry, "tree" | "flat">,
): FolderCacheEntry => {
  const existing = getValidEntry(userId) ?? { expiresAt: 0 };
  const next: FolderCacheEntry = {
    ...existing,
    ...patch,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  folderCache.set(userId, next);
  return next;
};

export const clearFolderCache = (userId: string) => {
  folderCache.delete(userId);
};
