const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app", // Netlify production frontend
  "https://walrus-jpfl.onrender.com",          // Render production backend
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const RENDER_PREVIEW_REGEX =
  /^https:\/\/walrus-jpfl-pr-\d+\.onrender\.com$/i;

// Utility to apply proper CORS headers
export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) allowOrigin = origin;
  else if (NETLIFY_PREVIEW_REGEX.test(origin)) allowOrigin = origin;
  else if (RENDER_PREVIEW_REGEX.test(origin)) allowOrigin = origin;

  // fallback: allow same-origin requests from Render itself (health checks)
  if (!allowOrigin && origin.endsWith(".onrender.com")) {
    allowOrigin = origin;
  }

  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  } else {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return headers;
}
