import jwt from 'jsonwebtoken';

// `kind` is an explicit discriminator so a token minted for one purpose can
// never be accepted where a different kind is required — e.g. without it, an
// athlete's session (sub = athleteId) would satisfy requireUserAuth's "has a
// sub" check and get treated as an organizer's account id.
// tournamentId is present only on a "tournament-token" (minted when an
// organizer creates or selects one of their tournaments) — a bare
// "user-token" from login/register omits it and identifies just the person,
// since one account can now own many tournaments.
// 'mat' is a narrow, short-lived credential minted by an organizer for one
// mat referee/scorekeeper — scoped to a single tournament AND a single mat
// (see `mat` below), unlike 'tournament' which grants full access.
export type SessionKind = 'user' | 'tournament' | 'athlete' | 'mat';

export interface SessionPayload {
  sub: string;
  kind: SessionKind;
  tournamentId?: string;
  mat?: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signSession(payload: SessionPayload, options?: { expiresIn?: jwt.SignOptions['expiresIn'] }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: options?.expiresIn ?? '30d' });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, getSecret()) as SessionPayload;
}
