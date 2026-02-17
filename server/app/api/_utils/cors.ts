const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:3000",
  "https://mysten-labs-capstone.netlify.app",
  "https://infinitystorage.app",
  "https://www.infinitystorage.app",
]);

const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

const NETLIFY_ANY_REGEX = /^https:\/\/.+\.netlify\.app$/i;

const VERCEL_PREVIEW_REGEX =
  /^https:\/\/walrus-git-.+-neils-projects-3cbdf85d\.vercel\.app$/i;

export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  headers.set("Access-Control-Max-Age", "86400");

  return headers;
}