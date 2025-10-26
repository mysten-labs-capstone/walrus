export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_SERVER_URL?.replace(/\/$/, "") ?? "";
  return `${base}${path}`;
}
