function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function slugBranch(input: string) {
  return (input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const VERCEL_TEAM = "neils-projects-3cbdf85d";
const VERCEL_PROJECT = "walrus-three";
const PROD_SERVER = "https://walrus-three.vercel.app";
const LOCAL_SERVER = "http://localhost:3000";

function buildVercelPreviewBase(branch: string | undefined): string | null {
  if (!branch) return null;
  const slug = slugBranch(branch);
  if (slug === "main") return PROD_SERVER;
  return `https://${VERCEL_PROJECT}-git-${slug}-${VERCEL_TEAM}.vercel.app`;
}

export function getServerOrigin(): string {
  // Allow explicit API base override at build time (for production)
  const explicitApiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (explicitApiBase) {
    console.log("[API] Using VITE_API_BASE:", explicitApiBase);
    return trimSlash(explicitApiBase);
  }

  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) {
    console.log("[API] Using VITE_SERVER_URL:", explicit);
    return trimSlash(explicit);
  }

  // Runtime-based logic for dev, preview, and production
  if (typeof window !== "undefined") {
    // Allow override via query param for testing: ?apiBase=https://example.com
    const params = new URLSearchParams(window.location.search);
    const apiBaseParam = params.get('apiBase');
    if (apiBaseParam) {
      console.log("[API] Using query param override:", apiBaseParam);
      return trimSlash(apiBaseParam);
    }

    const host = window.location.host;
    const protocol = window.location.protocol;

    // Local development
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      console.log("[API] Using local server");
      return LOCAL_SERVER;
    }

    // Netlify preview: map preview domain to corresponding Vercel backend preview
    if (host.includes("deploy-preview") && host.includes("netlify.app")) {
      // Extract preview number: deploy-preview-123--mysten-labs-capstone.netlify.app
      const match = host.match(/deploy-preview-(\d+)/);
      if (match) {
        const previewNum = match[1];
        console.log("[API] Netlify preview detected, falling back to prod (use ?apiBase=... to override)");
      }
      return PROD_SERVER;
    }

    // Netlify production: call prod Vercel backend
    if (host === "mysten-labs-capstone.netlify.app") {
      console.log("[API] Netlify production, using prod Vercel backend");
      return PROD_SERVER;
    }

    // Fallback to prod
    console.log("[API] Using production server (unknown host:", host, ")");
    return PROD_SERVER;
  }

  console.log("[API] Using production server (no window)");
  return PROD_SERVER;
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  return url;
}
