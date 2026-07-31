import type { AgeCategory, BracketFormat, Competitor, Match, MatchEvent, Score, SparringFormat, TimerConfig, WeightCategory } from '../types';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export interface TournamentInfo {
  id: string;
  name: string;
  slug: string;
  eventDate: string | null;
  location: string | null;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  defaultBracketFormat: BracketFormat;
  sparringFormat: SparringFormat;
}

export interface PublicTournamentSummary {
  id: string;
  name: string;
  slug: string;
  eventDate: string | null;
  location: string | null;
}

// Two tokens: a "user-token" identifies the organizer's account (from
// login/register) and is used to list/create/select tournaments; a
// "session-token" is minted per-tournament (create/select) and scopes every
// existing tournament-owned endpoint exactly as before. An account can own
// many tournaments, so these can't be collapsed into one token.
const USER_TOKEN_KEY = 'bjj_user_token';
const SESSION_TOKEN_KEY = 'bjj_session_token';
const ATHLETE_TOKEN_KEY = 'bjj_athlete_token';

function readToken(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeToken(key: string, token: string): void {
  try {
    localStorage.setItem(key, token);
  } catch {
    /* ignore */
  }
}

function removeToken(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getUserToken(): string { return readToken(USER_TOKEN_KEY); }
export function setUserToken(token: string): void { writeToken(USER_TOKEN_KEY, token); }
export function clearUserToken(): void { removeToken(USER_TOKEN_KEY); }

export function getSessionToken(): string { return readToken(SESSION_TOKEN_KEY); }
export function setSessionToken(token: string): void { writeToken(SESSION_TOKEN_KEY, token); }
export function clearSessionToken(): void { removeToken(SESSION_TOKEN_KEY); }

export function getAthleteToken(): string { return readToken(ATHLETE_TOKEN_KEY); }
export function setAthleteToken(token: string): void { writeToken(ATHLETE_TOKEN_KEY, token); }
export function clearAthleteToken(): void { removeToken(ATHLETE_TOKEN_KEY); }

type AuthMode = 'none' | 'user' | 'tournament' | 'athlete' | 'explicit';

async function rawRequest<T>(method: string, path: string, body: unknown, authMode: AuthMode, explicitToken?: string): Promise<ApiResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authMode === 'user') {
      const token = getUserToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } else if (authMode === 'tournament') {
      const token = getSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } else if (authMode === 'athlete') {
      const token = getAthleteToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } else if (authMode === 'explicit' && explicitToken) {
      headers.Authorization = `Bearer ${explicitToken}`;
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

// Tournament-scoped (existing behavior, unchanged) — every /api/competitors,
// /api/matches, /api/timer-config, /api/registrations, /api/import, /api/reset call.
function request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, 'tournament');
}

// User-scoped — /api/auth/me and /api/tournaments (list/create/select/patch).
function userRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, 'user');
}

function publicRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, 'none');
}

// Athlete-scoped — /api/public/athlete/* endpoints, once logged into the cabinet.
function athleteRequest<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, 'athlete');
}

// Mat-token-scoped — the token is passed explicitly (never persisted to
// storage) and lives only in the referee's shared URL, same as the TV
// display's `?display=true` link.
function tokenRequest<T>(method: string, path: string, body: unknown, token: string): Promise<ApiResult<T>> {
  return rawRequest<T>(method, path, body, 'explicit', token);
}

export const api = {
  // --- Account (user-token) ---
  register: (email: string, password: string) => publicRequest<{ token: string }>('POST', '/auth/register', { email, password }),
  login: (email: string, password: string) => publicRequest<{ token: string }>('POST', '/auth/login', { email, password }),
  loginWithGoogle: (credential: string) => publicRequest<{ token: string }>('POST', '/auth/google', { credential }),
  forgotPassword: (email: string) => publicRequest<{ ok: true; devResetToken?: string }>('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) => publicRequest<{ ok: true }>('POST', '/auth/reset-password', { token, newPassword }),
  me: () => userRequest<{ email: string }>('GET', '/auth/me'),

  // --- Tournaments (user-token) — an account can own many ---
  listTournaments: () => userRequest<TournamentInfo[]>('GET', '/tournaments'),
  createTournament: (data: { name: string; eventDate?: string; location?: string; description?: string; defaultBracketFormat?: BracketFormat; sparringFormat?: SparringFormat }) =>
    userRequest<{ token: string; tournament: TournamentInfo }>('POST', '/tournaments', data),
  selectTournament: (id: string) => userRequest<{ token: string; tournament: TournamentInfo }>('POST', `/tournaments/${id}/select`),
  updateTournament: (id: string, patch: Partial<{ name: string; eventDate: string | null; location: string | null; description: string | null; status: TournamentInfo['status']; defaultBracketFormat: BracketFormat; sparringFormat: SparringFormat }>) =>
    userRequest<TournamentInfo>('PATCH', `/tournaments/${id}`, patch),

  // --- Organizer (session-token, tournament-scoped server-side) ---
  getCurrentTournament: () => request<TournamentInfo>('GET', '/tournament'),
  getCompetitors: () => request<Competitor[]>('GET', '/competitors'),
  createCompetitor: (c: Competitor) => request<Competitor>('POST', '/competitors', c),
  patchCompetitor: (id: string, patch: Partial<Pick<Competitor, 'madeWeight' | 'isAbsolute' | 'weight' | 'belt' | 'ageGroup' | 'competesGi' | 'competesNoGi' | 'ageCategoryId'>>) =>
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

  getWeightCategories: () => request<WeightCategory[]>('GET', '/weight-categories'),
  updateWeightCategories: (categories: WeightCategory[]) => request<WeightCategory[]>('PUT', '/weight-categories', categories),

  getAgeCategories: () => request<AgeCategory[]>('GET', '/age-categories'),
  updateAgeCategories: (categories: AgeCategory[]) => request<AgeCategory[]>('PUT', '/age-categories', categories),

  generateMatToken: (mat: string) => request<{ token: string }>('POST', `/tournament/mats/${mat}/token`),

  importAll: (payload: { competitors: Competitor[]; matches: Match[]; timerConfig?: TimerConfig }) =>
    request<{ competitors: Competitor[]; matches: Match[] }>('POST', '/import', payload),
  resetAll: () => request<void>('POST', '/reset'),
};

// --- Public (no session, tournament identified by slug in the URL) ---
// Used by the athlete self-registration page and the TV scoreboard display.
export const publicApi = {
  getPublicTournaments: () => publicRequest<PublicTournamentSummary[]>('GET', '/public/tournaments'),
  getCompetitors: (slug: string) => publicRequest<Competitor[]>('GET', `/public/${slug}/competitors`),
  getMatches: (slug: string) => publicRequest<Match[]>('GET', `/public/${slug}/matches`),
  getTimerConfig: (slug: string) => publicRequest<TimerConfig>('GET', `/public/${slug}/timer-config`),
  getTournamentInfo: (slug: string) => publicRequest<{ name: string; sparringFormat: SparringFormat }>('GET', `/public/${slug}`),
  getWeightCategories: (slug: string) => publicRequest<WeightCategory[]>('GET', `/public/${slug}/weight-categories`),
  getAgeCategories: (slug: string) => publicRequest<AgeCategory[]>('GET', `/public/${slug}/age-categories`),
  submitRegistration: (slug: string, c: Competitor & { email: string }) =>
    publicRequest<{ ok: true; devVerifyToken?: string }>('POST', `/public/${slug}/registrations`, c),
  verifyRegistration: (token: string) => publicRequest<{ token: string }>('POST', '/public/verify-registration', { token }),
  requestAthleteLogin: (email: string) =>
    publicRequest<{ ok: true; devLoginToken?: string }>('POST', '/public/athlete/request-login', { email }),
  athleteLogin: (token: string) => publicRequest<{ token: string }>('POST', '/public/athlete/login', { token }),
};

export interface AthleteRegistration extends Competitor {
  tournamentName: string;
  tournamentSlug: string;
}

// --- Athlete cabinet (athlete-token, minted by verify-registration/athlete/login) ---
export const athleteApi = {
  me: () => athleteRequest<AthleteRegistration[]>('GET', '/public/athlete/me'),
  updateRegistration: (id: string, patch: Omit<Competitor, 'id' | 'status'>) =>
    athleteRequest<Competitor>('PATCH', `/public/athlete/registrations/${id}`, patch),
};

// --- Mat referee/scorekeeper (mat-token, minted by the organizer, embedded
// in the shared link — never persisted, unlike the other token stores above) ---
export const matOperatorApi = {
  finishMatch: (
    token: string,
    matchId: string,
    payload: { winnerId: string; method: string; score1: Score; score2: Score; logs: MatchEvent[] }
  ) => tokenRequest<Match>('POST', `/matches/${matchId}/finish`, payload, token),
};
