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
  // Allow explicit API base override at build time
  const explicitApiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (explicitApiBase) return trimSlash(explicitApiBase);

  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) return trimSlash(explicit);

  // Netlify branch (available on preview + prod)
  const branch = import.meta.env.BRANCH as string | undefined;
  const vercelPreview = buildVercelPreviewBase(branch);
  if (vercelPreview) return trimSlash(vercelPreview);

  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      return LOCAL_SERVER;
    }
  }

  return PROD_SERVER;
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  return url;
}
