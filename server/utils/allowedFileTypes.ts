/**
 * Allowed file extensions for uploads. Must stay in sync with client/src/config/allowedFileTypes.ts.
 * Documents, Images, Videos, Audio, Archives, Office, and common professional types.
 */
const ALLOWED_EXTENSIONS_LIST = [
  "pdf", "txt", "json",
  "jpg", "jpeg", "png", "gif", "webp", "svg", "heic",
  "mp4", "webm", "mov", "avi", "mkv",
  "mp3", "wav", "m4a", "aac", "ogg", "flac",
  "zip", "tar", "gz", "tgz", "7z", "rar",
  "docx", "xlsx", "pptx", "doc", "xls", "ppt",
  "md", "csv", "rtf", "odt", "ods", "odp", "yaml", "yml", "xml", "tex", "epub",
];

export const ALLOWED_EXTENSIONS = new Set(
  ALLOWED_EXTENSIONS_LIST,
);

/**
 * Returns true if the given filename has an allowed extension (case-insensitive).
 */
export function isAllowedFilename(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  const ext = filename.slice(i + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}
