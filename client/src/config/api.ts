function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

const PROD_SERVER = "https://walrus-jpfl.onrender.com";
const LOCAL_SERVER = "http://localhost:3000";

export function getServerOrigin(): string {
  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  if (explicit) return trimSlash(explicit);

  const branch = (import.meta.env.HEAD || import.meta.env.BRANCH) as string | undefined;
  const context = import.meta.env.CONTEXT as string | undefined;

  console.log('[API Config] Netlify context:', { branch, context, explicit });

  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      return LOCAL_SERVER;
    }
  }

  console.log('[API Config] Falling back to production:', PROD_SERVER);
  return PROD_SERVER;
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  return url;
}
