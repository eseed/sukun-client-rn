import type { SukunApi } from './contract';
import { liveApi } from './live';
import { mockApi } from './mock';

/**
 * The single switch between backends. Screens import nothing from `mock/` or `live/` — they
 * call the TanStack Query hooks in `src/hooks/`, which call `api`.
 *
 * `EXPO_PUBLIC_API_MODE=live` requires `EXPO_PUBLIC_API_BASE_URL`; staging is not deployed
 * yet, so `mock` is the default.
 */

export type ApiMode = 'mock' | 'live';

export const API_MODE: ApiMode = process.env.EXPO_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';

export const api: SukunApi = API_MODE === 'live' ? liveApi : mockApi;

export type { SukunApi };
export * from './types';
