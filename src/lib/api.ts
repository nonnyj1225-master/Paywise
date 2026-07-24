// Shared API fetch helper with auth token injection.
// The AuthContext sets the token and optional onUnauthorized callback.

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function apiFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const headers = new Headers(options?.headers);
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  return res;
}
