const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app",
  "https://walrus-three.vercel.app",
]);

// https://deploy-preview-48--mysten-labs-capstone.netlify.app
const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

// https://walrus-git-<branch>-neils-projects-3cbdf85d.vercel.app
const VERCEL_PREVIEW_REGEX =
  /^https:\/\/walrus-git-[a-z0-9-]+-neils-projects-3cbdf85d\.vercel\.app$/i;

export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) {
    allowOrigin = origin;
  } else if (NETLIFY_PREVIEW_REGEX.test(origin)) {
    allowOrigin = origin;
  } else if (VERCEL_PREVIEW_REGEX.test(origin)) {
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
