const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app",
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const VERCEL_PREVIEW_REGEX =
  /^https:\/\/walrus-git-.+-neils-projects-3cbdf85d\.vercel\.app$/i;

export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) {
    allowOrigin = origin;
    console.log('[withCORS] Matched STATIC_ALLOWED:', origin);
  } else if (NETLIFY_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
    console.log('[withCORS] Matched NETLIFY_PREVIEW_REGEX:', origin);
  } else if (VERCEL_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
    console.log('[withCORS] Matched VERCEL_PREVIEW_REGEX:', origin);
  } else {
    console.log('[withCORS] NO MATCH for origin:', origin);
  }

  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
    console.log('[withCORS] Set headers - Allow-Origin:', allowOrigin);
  } else {
    console.log('[withCORS] NOT setting Allow-Origin - no match found');
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  console.log('[withCORS] Final headers:', Object.fromEntries(headers.entries()));
  return headers;
}
