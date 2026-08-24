import type { SessionTokens } from '../types';
import {
  deleteSecureItem,
  getSecureItem,
  SECURE_KEYS,
  setSecureItem,
} from '../../lib/secure-storage';

/**
 * Thin typed fetch wrapper for the live backend.
 *
 * Route shape comes from `sukun-backend/src/bootstrap/configure-application.ts`:
 * global prefix `api`, URI versioning, default version `1` — so every path is
 * `{base}/api/v1/{path}`.
 */

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const API_PREFIX = 'api';
const API_VERSION = 'v1';
const REFRESH_PATH = 'mobile/auth/refresh';

interface RefreshResult {
  refreshed: boolean;
  definitiveFailure: boolean;
}

let refreshPromise: Promise<RefreshResult> | null = null;
let authFailureHandler: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details: unknown[] = [],
    public requestId?: string,
    public timestamp?: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Registered by the auth store so transport code does not import the store back. */
export function setAuthFailureHandler(handler: (() => void) | null): void {
  authFailureHandler = handler;
}

function url(path: string): string {
  if (!API_BASE_URL) {
    throw new ApiError(
      'API_NOT_CONFIGURED',
      'EXPO_PUBLIC_API_BASE_URL is not set. Staging is not deployed yet — run in mock mode.',
      0,
    );
  }
  const clean = path.replace(/^\//, '');
  return `${API_BASE_URL.replace(/\/$/, '')}/${API_PREFIX}/${API_VERSION}/${clean}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  auth?: boolean;
  /** For the multipart selfie upload. */
  form?: FormData;
  /** Used for the one authenticated request immediately after OTP verification. */
  token?: string;
  /** Set false for a request that must not trigger token rotation. */
  retryOnUnauthorized?: boolean;
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

async function rotateTokens(): Promise<RefreshResult> {
  const refreshToken = await getSecureItem(SECURE_KEYS.refreshToken);
  if (!refreshToken) return { refreshed: false, definitiveFailure: true };

  let response: Response;
  try {
    response = await fetch(url(REFRESH_PATH), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // A device going temporarily offline must not become a forced sign-out.
    return { refreshed: false, definitiveFailure: false };
  }

  if (!response.ok) {
    const definitiveFailure = response.status === 401 || response.status === 403;
    return { refreshed: false, definitiveFailure };
  }

  let tokens: SessionTokens;
  try {
    tokens = (await response.json()) as SessionTokens;
  } catch {
    return { refreshed: false, definitiveFailure: false };
  }
  if (!tokens.accessToken || !tokens.refreshToken) {
    return { refreshed: false, definitiveFailure: false };
  }

  // Refresh-token rotation returns a new pair. Persist both, never reuse the old refresh token.
  await setSecureItem(SECURE_KEYS.accessToken, tokens.accessToken);
  await setSecureItem(SECURE_KEYS.refreshToken, tokens.refreshToken);
  return { refreshed: true, definitiveFailure: false };
}

async function refreshAccessToken(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = rotateTokens()
      .catch(() => ({ refreshed: false, definitiveFailure: false }))
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function shouldRefresh(path: string, auth: boolean, retryOnUnauthorized: boolean): boolean {
  return auth && retryOnUnauthorized && path !== REFRESH_PATH;
}

function parseError(response: Response, payload: unknown): ApiError {
  const err =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as {
          error?: unknown;
          message?: unknown;
          statusCode?: unknown;
          details?: unknown;
          requestId?: unknown;
          timestamp?: unknown;
          retryAfterSeconds?: unknown;
        })
      : null;

  const code = typeof err?.error === 'string' ? err.error : 'UNKNOWN';
  const message = typeof err?.message === 'string' ? err.message : response.statusText;
  const status = typeof err?.statusCode === 'number' ? err.statusCode : response.status;
  const details = Array.isArray(err?.details) ? err.details : [];
  const requestId = typeof err?.requestId === 'string' ? err.requestId : undefined;
  const timestamp = typeof err?.timestamp === 'string' ? err.timestamp : undefined;
  const retryAfterSeconds =
    typeof err?.retryAfterSeconds === 'number' ? err.retryAfterSeconds : undefined;

  return new ApiError(code, message, status, details, requestId, timestamp, retryAfterSeconds);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    auth = true,
    form,
    token,
    retryOnUnauthorized = true,
  } = options;

  // The app is English-only (CLAUDE.md) — every mobile/public endpoint defaults to Arabic
  // content (event copy, error messages) without this header.
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'en' };
  if (body !== undefined && form === undefined) headers['Content-Type'] = 'application/json';
  const sentAccessToken = auth ? (token ?? (await getSecureItem(SECURE_KEYS.accessToken))) : null;
  if (auth) {
    if (sentAccessToken) headers.Authorization = `Bearer ${sentAccessToken}`;
  }

  const response = await fetch(`${url(path)}${buildQuery(query)}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (response.status === 204) return undefined as T;

  const responseText = await response.text();
  let payload: unknown = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error = parseError(response, payload);
    if (response.status === 401 && shouldRefresh(path, auth, retryOnUnauthorized)) {
      // Another request may have completed the shared refresh while this request was in flight.
      // Replay with that token instead of rotating the refresh token a second time.
      const currentAccessToken = await getSecureItem(SECURE_KEYS.accessToken);
      if (sentAccessToken && currentAccessToken && sentAccessToken !== currentAccessToken) {
        return request<T>(path, { ...options, retryOnUnauthorized: false });
      }

      const refreshResult = await refreshAccessToken();
      if (refreshResult.refreshed) {
        return request<T>(path, { ...options, retryOnUnauthorized: false });
      }

      if (refreshResult.definitiveFailure) {
        await deleteSecureItem(SECURE_KEYS.accessToken);
        await deleteSecureItem(SECURE_KEYS.refreshToken);
        try {
          authFailureHandler?.();
        } catch {
          // Preserve the original API error if the session transition cannot start.
        }
      }
    }
    throw error;
  }

  return payload as T;
}
