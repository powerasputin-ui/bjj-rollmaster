import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/jwt.js';

// Requires an athlete-token (minted by confirming a registration's email or
// requesting a fresh magic link) — used by the athlete's own cabinet
// endpoints (view/edit their own registrations across tournaments).
export function requireAthleteAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifySession(token);
    if (payload.kind !== 'athlete') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.athleteId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
