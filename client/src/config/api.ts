function trimSlash(s: string) {
  return s.replace(/\/+$/, "");
}

const PROD_SERVER = "https://api.infinitystorage.app";
const LOCAL_SERVER = "http://localhost:3000";

export function getServerOrigin(): string {
  const explicit = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
  
  console.debug('[API Config] VITE_SERVER_URL from env:', explicit);
  console.debug('[API Config] All import.meta.env keys:', Object.keys(import.meta.env).filter(k => k.includes('VITE') || k.includes('SERVER')));
  
  if (explicit && explicit !== '') {
    console.debug('[API Config] Using explicit URL:', explicit);
    return trimSlash(explicit);
  }

  if (typeof window !== "undefined") {
    const host = window.location.host;
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      console.debug('[API Config] Using local server for localhost');
      return LOCAL_SERVER;
    }
  }

  console.debug('[API Config] Using default production server:', PROD_SERVER);
  return PROD_SERVER;
}

export function apiUrl(path: string): string {
  const base = getServerOrigin();
  const cleanBase = trimSlash(base || "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${cleanBase}${cleanPath}`;

  return url;
}
