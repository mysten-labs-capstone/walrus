// Allowed static origins
const STATIC_ALLOWED = new Set<string>([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://mysten-labs-capstone.netlify.app", // Netlify prod
]);

// Netlify Preview: e.g. https://deploy-preview-12--mysten-labs-capstone.netlify.app
const NETLIFY_PREVIEW_REGEX =
  /^https:\/\/deploy-preview-\d+--mysten-labs-capstone\.netlify\.app$/i;

// Vercel Preview: e.g. https://walrus-three-git-feature-x-neils-projects-3cbdf85d.vercel.app
const VERCEL_PREVIEW_REGEX =
  /^https:\/\/[a-z0-9-]+-git-[a-z0-9-]+-[a-z0-9-]+\.vercel\.app$/i;

const VERCEL_PROD_REGEX =
  /^https:\/\/walrus-three\.vercel\.app$/i;

export function withCORS(
  req: Request,
  extra?: HeadersInit
): Headers {
  const headers = new Headers(extra);
  const origin = req.headers.get("origin") ?? "";

  let allowOrigin = "";

  if (
    STATIC_ALLOWED.has(origin) ||
    NETLIFY_PREVIEW_REGEX.test(origin) ||
    VERCEL_PREVIEW_REGEX.test(origin) ||
    VERCEL_PROD_REGEX.test(origin)
  ) {
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
