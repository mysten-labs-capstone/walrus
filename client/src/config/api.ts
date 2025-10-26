function trimSlash(s: string) {
  return s.replace(/\/+$/, '');
}

function slugBranch(input: string) {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isNetlifyPreviewHost(host: string) {
  return /^deploy-preview-\d+--.+\.netlify\.app$/i.test(host);
}

function isNetlifyProd(host: string) {
  return /^mysten-labs-capstone\.netlify\.app$/i.test(host);
}

function sameOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

function buildVercelPreviewBase(): string | null {
  const project = import.meta.env.VITE_VERCEL_PROJECT?.trim();
  const team = import.meta.env.VITE_VERCEL_TEAM_SLUG?.trim();
  const branchRaw = import.meta.env.VITE_GIT_BRANCH?.trim();

  if (!project || !team || !branchRaw) return null;

  const branch = slugBranch(branchRaw);

  // Actual Vercel preview convention:
  //   https://<project>-git-<branch>-<team>.vercel.app
  return `https://${project}-git-${branch}-${team}.vercel.app`;
}

export function getServerOrigin(): string {
  const explicit = import.meta.env.VITE_SERVER_URL?.trim();

  // If on localhost client, NEVER force VITE_SERVER_URL (use local backend)
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "http://localhost:3000";
  }

  // Netlify Preview → map to matching Vercel Preview
  if (typeof window !== "undefined") {
    const host = window.location.host;

    if (isNetlifyPreviewHost(host)) {
      const preview = buildVercelPreviewBase();
      if (preview) return trimSlash(preview);
      // Safe fallback to prod
      return "https://walrus-three.vercel.app";
    }

    // Netlify Production → always Vercel Production
    if (isNetlifyProd(host)) {
      return "https://walrus-three.vercel.app";
    }
  }

  // If not running in a special environment, allow VITE_SERVER_URL override
  if (explicit) return trimSlash(explicit);

  // Default fallback for SSR or unknown env
  return trimSlash(sameOrigin() || "http://localhost:3000");
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}
