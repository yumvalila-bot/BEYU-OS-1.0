/**
 * BEYU Health OS — real backend authentication client.
 *
 * Security model:
 *  - The refresh token lives in an httpOnly, SameSite cookie set by the backend;
 *    browser JS can never read it. All requests use `credentials: 'include'`.
 *  - The access token is held in memory only (never localStorage) and refreshed
 *    transparently on 401 via /auth/refresh.
 *  - Authorization is enforced server-side; this client never defines it.
 */

export interface AuthUser {
  globalUserId: string;
  email: string;
  displayName: string;
  role?: string;
  tenantId?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RestoreResponse {
  accessToken: string;
  user: AuthUser & { role?: string; tenantId?: string | null };
}

type AuthedRequestInit = RequestInit & { retry?: boolean };

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** In-memory access token — never persisted to localStorage. */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, init: AuthedRequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (response.status === 401 && !init.retry) {
    // Attempt a single silent refresh; if it succeeds, retry the original call.
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...init, retry: true });
    }
    setAccessToken(null);
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new AuthError(message, response.status);
  }
  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    setAccessToken(null);
  }
}

/** Restore a session from the httpOnly refresh cookie (on app load). */
export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const data = await request<RestoreResponse>("/auth/restore", {
      method: "POST",
    });
    setAccessToken(data.accessToken);
    return data.user;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function me(): Promise<AuthUser | null> {
  try {
    return await request<AuthUser>("/auth/me");
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
