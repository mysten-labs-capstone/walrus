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

function isNetlifyPreviewHost(host: string) {
  return /^deploy-preview-\d+--.+\.netlify\.app$/i.test(host);
}

function sameOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

function buildVercelPreviewBase(): string | null {
  const project = import.meta.env.VITE_VERCEL_PROJECT as string | undefined;
  const team = import.meta.env.VITE_VERCEL_TEAM_SLUG as string | undefined;
  const branchRaw = import.meta.env.VITE_GIT_BRANCH as string | undefined;

  if (!project || !team || !branchRaw) return null;

  const branch = slugBranch(branchRaw);
  return `https://${project}-git-${branch}-${team}.vercel.app`;
}

export function getServerOrigin(): string {
  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) return trimSlash(explicit);

  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (isNetlifyPreviewHost(host)) {
      const candidate = buildVercelPreviewBase();
      if (candidate) return trimSlash(candidate);
      return "https://walrus-three.vercel.app";
    }

    if (host === "mysten-labs-capstone.netlify.app") {
      return "https://walrus-three.vercel.app";
    }
  }

  return trimSlash(sameOrigin() || "http://localhost:3000");
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  if (import.meta.env.DEV) console.log("[Client] Resolved API Base:", cleanBase);
  return url;
}
