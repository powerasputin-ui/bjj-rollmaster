import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/jwt.js';

// Requires a tournament-scoped token (has tournamentId) — every route that
// reads/writes a specific tournament's data uses this. A bare user-token
// (from login/register, before a tournament is created/selected) is
// rejected here rather than silently proceeding with an undefined tournamentId.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifySession(token);
    if (!payload.tournamentId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.tournamentId = payload.tournamentId;
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
