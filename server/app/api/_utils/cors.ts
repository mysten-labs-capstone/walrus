// Exact static allowed origins
const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app", // Netlify production
]);

// Netlify preview: deploy-preview-48--<site>.netlify.app
const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--[^.]+\.netlify\.app\/?$/i;

// Vercel production (server)
const VERCEL_PROD_REGEX =
  /^https:\/\/walrus-three\.vercel\.app\/?$/i;

// Vercel preview: <project>-git-<branch>-<team>.vercel.app
const VERCEL_PREVIEW_REGEX =
  /^https:\/\/[a-z0-9-]+-git-[a-z0-9-]+-[^.]+\.vercel\.app\/?$/i;

export function withCORS(req: Request, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin: string | null = null;

  if (STATIC_ALLOWED.has(origin)) allowOrigin = origin;
  else if (NETLIFY_PREVIEW_REGEX.test(origin)) allowOrigin = origin;
  else if (VERCEL_PROD_REGEX.test(origin)) allowOrigin = origin;
  else if (VERCEL_PREVIEW_REGEX.test(origin)) allowOrigin = origin;

  if (allowOrigin) {
    headers.set("Access-Control-Allow-Origin", allowOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return headers;
}
