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
  // e.g. deploy-preview-12--your-site.netlify.app
  return /^deploy-preview-\d+--.+\.netlify\.app$/i.test(host);
}

function isNetlifyHost(host: string) {
  return /\.netlify\.app$/i.test(host);
}

function sameOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

function buildVercelPreviewBase(): string | null {
  const project = import.meta.env.VITE_VERCEL_PROJECT as string | undefined;   // e.g. "walrus-three"
  const team = import.meta.env.VITE_VERCEL_TEAM_SLUG as string | undefined;    // e.g. "neils-projects-3cbdf85d"
  const branchRaw = import.meta.env.VITE_GIT_BRANCH as string | undefined;     // e.g. "feature/kl-backend"

  if (!project || !team || !branchRaw) return null;

  const branch = slugBranch(branchRaw);
  // Vercel preview convention: <project>-git-<branch>-<team>.vercel.app
  return `https://${project}-git-${branch}-${team}.vercel.app`;
}

export function getServerOrigin(): string {
  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) return trimSlash(explicit);

  // 2) If running on a Netlify preview host, try to build the matching Vercel preview
  if (typeof window !== 'undefined') {
    const host = window.location.host;
    if (isNetlifyPreviewHost(host)) {
      const candidate = buildVercelPreviewBase();
      if (candidate) return trimSlash(candidate);
      return 'https://walrus-three.vercel.app';
    }
    // 3) Netlify prod → Vercel prod
    if (isNetlifyHost(host)) {
      return 'https://walrus-three.vercel.app';
    }
  }

  return trimSlash(sameOrigin() || 'http://localhost:3000');
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}