/**
 * Allowed file extensions for uploads. Only these types can be selected in the
 * file picker and accepted via drag-and-drop or API.
 *
 * Documents: pdf, txt, json
 * Images: jpg, jpeg, png, gif, webp, svg, heic
 * Videos: mp4, webm, mov, avi, mkv
 * Audio: mp3, wav, m4a, aac, ogg, flac
 * Archives: zip, tar, gz, tgz, 7z, rar
 * Office: docx, xlsx, pptx, doc, xls, ppt
 * Other (professional): md, csv, rtf, odt, ods, odp, yaml, yml, xml, tex, epub
 */
const ALLOWED_EXTENSIONS_LIST = [
  // Documents
  "pdf",
  "txt",
  "json",
  // Images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "heic",
  // Videos
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  // Audio
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
  // Archives
  "zip",
  "tar",
  "gz",
  "tgz",
  "7z",
  "rar",
  // Office
  "docx",
  "xlsx",
  "pptx",
  "doc",
  "xls",
  "ppt",
  // Other professional
  "md",
  "csv",
  "rtf",
  "odt",
  "ods",
  "odp",
  "yaml",
  "yml",
  "xml",
  "tex",
  "epub",
] as const;

export const ALLOWED_EXTENSIONS = new Set<string>(
  ALLOWED_EXTENSIONS_LIST as unknown as string[],
);

/**
 * HTML accept attribute value so the file picker only offers allowed types.
 * Comma-separated list of extensions with leading dot and MIME wildcards where useful.
 */
export const FILE_PICKER_ACCEPT =
  ".pdf,.txt,.json,.jpg,.jpeg,.png,.gif,.webp,.svg,.heic,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.zip,.tar,.gz,.tgz,.7z,.rar,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.md,.csv,.rtf,.odt,.ods,.odp,.yaml,.yml,.xml,.tex,.epub";

/**
 * Returns true if the file's extension is in the allowed list (case-insensitive).
 */
export function isAllowedFile(file: File): boolean {
  const name = file.name || "";
  const i = name.lastIndexOf(".");
  if (i < 0) return false;
  const ext = name.slice(i + 1).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Returns the first disallowed extension found, or null if all allowed.
 */
export function getDisallowedExtensions(files: File[]): string[] {
  const disallowed = new Set<string>();
  for (const file of files) {
    const name = file.name || "";
    const i = name.lastIndexOf(".");
    const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : "";
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      disallowed.add(ext || "(no extension)");
    }
  }
  return Array.from(disallowed);
}

/**
 * Filter to only allowed files.
 */
export function filterAllowedFiles(files: File[]): File[] {
  return files.filter(isAllowedFile);
}
