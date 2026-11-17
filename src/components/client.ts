'use client';

/** JSON request helper for client components. Throws with the server's message. */
export async function api<T = any>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = '/login';
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}
