import type { Competitor, Match, MatchEvent, Score, TimerConfig } from '../types';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export interface TournamentInfo {
  id: string;
  name: string;
  slug: string;
}

const SESSION_TOKEN_KEY = 'bjj_session_token';

export function getSessionToken(): string {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function rawRequest<T>(method: string, path: string, body: unknown, withAuth: boolean): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withAuth) {
      const token = getSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let error = `HTTP ${res.status}`;
      try {
        const payload = await res.json();
        if (payload?.error) error = payload.error;
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, error, status: res.status };
    }

    if (res.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network_error' };
  }
}

function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, true);
}

function publicRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, false);
}

export const api = {
  // --- Auth ---
  register: (email: string, password: string, tournamentName: string) =>
    request<{ token: string; tournament: TournamentInfo }>('POST', '/auth/register', { email, password, tournamentName }),
  login: (email: string, password: string) =>
    request<{ token: string; tournament: TournamentInfo }>('POST', '/auth/login', { email, password }),
  loginWithGoogle: (credential: string, tournamentName?: string) =>
    request<{ token: string; tournament: TournamentInfo }>('POST', '/auth/google', { credential, tournamentName }),
  forgotPassword: (email: string) => request<{ ok: true; devResetToken?: string }>('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) => request<{ ok: true }>('POST', '/auth/reset-password', { token, newPassword }),
  me: () => request<{ email: string; tournament: TournamentInfo }>('GET', '/auth/me'),

  // --- Organizer (authenticated, tournament-scoped server-side) ---
  getCompetitors: () => request<Competitor[]>('GET', '/competitors'),
  createCompetitor: (c: Competitor) => request<Competitor>('POST', '/competitors', c),
  patchCompetitor: (id: string, patch: Partial<Pick<Competitor, 'madeWeight' | 'isAbsolute' | 'weight'>>) =>
    request<Competitor>('PATCH', `/competitors/${id}`, patch),
  deleteCompetitor: (id: string) => request<void>('DELETE', `/competitors/${id}`),

  getPendingRegistrations: () => request<Competitor[]>('GET', '/registrations/pending'),
  approveRegistration: (id: string) => request<{ ok: true }>('POST', `/registrations/${id}/approve`),
  rejectRegistration: (id: string) => request<{ ok: true }>('POST', `/registrations/${id}/reject`),

  getMatches: () => request<Match[]>('GET', '/matches'),
  putBracketMatches: (bracketId: string, matches: Match[]) =>
    request<Match[]>('PUT', `/matches/bracket/${bracketId}`, { matches }),
  callToMat: (matchId: string, mat: string) =>
    request<Match>('POST', `/matches/${matchId}/call-to-mat`, { mat }),
  finishMatch: (matchId: string, payload: { winnerId: string; method: string; score1: Score; score2: Score; logs: MatchEvent[] }) =>
    request<Match>('POST', `/matches/${matchId}/finish`, payload),

  getTimerConfig: () => request<TimerConfig>('GET', '/timer-config'),
  updateTimerConfig: (config: TimerConfig) => request<TimerConfig>('PUT', '/timer-config', config),

  importAll: (payload: { competitors: Competitor[]; matches: Match[]; timerConfig?: TimerConfig }) =>
    request<{ competitors: Competitor[]; matches: Match[] }>('POST', '/import', payload),
  resetAll: () => request<void>('POST', '/reset'),
};

// --- Public (no session, tournament identified by slug in the URL) ---
// Used by the athlete self-registration page and the TV scoreboard display.
export const publicApi = {
  getCompetitors: (slug: string) => publicRequest<Competitor[]>('GET', `/public/${slug}/competitors`),
  getMatches: (slug: string) => publicRequest<Match[]>('GET', `/public/${slug}/matches`),
  getTimerConfig: (slug: string) => publicRequest<TimerConfig>('GET', `/public/${slug}/timer-config`),
  submitRegistration: (slug: string, c: Competitor) => publicRequest<{ ok: true }>('POST', `/public/${slug}/registrations`, c),
};
