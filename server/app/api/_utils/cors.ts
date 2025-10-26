// Allowed static origins
const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app",
]);

// Strict Netlify preview URLs, e.g.:
// https://deploy-preview-12--mysten-labs-capstone.netlify.app
const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/;

/**
 * Safe, beginner-proof CORS helper:
 * - Always returns a Headers object
 * - Accepts optional extra headers (merged in)
 * - Reflects a single allowed Origin (never multiple)
 * - Adds Vary: Origin when reflecting
 */
export function withCORS(
  req: Request,
  extra?: HeadersInit
): Headers {
  const headers = new Headers(extra);

  const origin = req.headers.get("origin") ?? "";

  let allowOrigin = "";
  if (STATIC_ALLOWED.has(origin) || NETLIFY_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
  }

  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return headers;
}
