import jwt from 'jsonwebtoken';

// tournamentId is present only on a "tournament-token" (minted when an
// organizer creates or selects one of their tournaments) — a bare
// "user-token" from login/register omits it and identifies just the person,
// since one account can now own many tournaments.
export interface SessionPayload {
  sub: string;
  tournamentId?: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload {
  return jwt.verify(token, getSecret()) as SessionPayload;
}
