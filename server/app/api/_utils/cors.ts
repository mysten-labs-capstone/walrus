const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app",
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const VERCEL_PREVIEW_REGEX =
  /^https:\/\/walrus(-[a-z0-9]+)?(-git-[a-z0-9-]+)?-neils-projects-3cbdf85d\.vercel\.app$/i;

const VERCEL_PROD = "https://walrus-three.vercel.app";

export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) allowOrigin = origin;
  else if (NETLIFY_PREVIEW_REGEX.test(origin)) allowOrigin = origin;
  else if (VERCEL_PREVIEW_REGEX.test(origin)) allowOrigin = origin;
  else if (origin === VERCEL_PROD) allowOrigin = origin;

  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return headers;
}
