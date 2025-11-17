import { apiUrl } from "../config/api";

export async function apiGet(path: string, init?: RequestInit) {
  const res = await fetch(apiUrl(path), {
    method: "GET",
    credentials: "include",
    ...(init || {}),
  });

  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiPost(path: string, body: any, init?: RequestInit) {
  const headers = { "Content-Type": "application/json", ...(init?.headers || {}) } as Record<string,string>;

  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
    ...(init || {}),
  });

  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiDelete(path: string, init?: RequestInit) {
  const res = await fetch(apiUrl(path), {
    method: "DELETE",
    credentials: "include",
    ...(init || {}),
  });

  if (!res.ok) {
    throw new Error(`DELETE ${path} failed: ${res.status}`);
  }

  return res.json();
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: 'include',
    ...(init || {}),
  });
}
