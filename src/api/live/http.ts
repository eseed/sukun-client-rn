import { getSecureItem, SECURE_KEYS } from '../../lib/secure-storage';

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

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, form } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getSecureItem(SECURE_KEYS.accessToken);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${url(path)}${buildQuery(query)}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = payload as { code?: string; message?: string } | null;
    throw new ApiError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? response.statusText,
      response.status,
    );
  }

  return payload as T;
}
