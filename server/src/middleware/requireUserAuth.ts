import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/jwt.js';

// Requires only a valid user-token (identifies the account, not any specific
// tournament) — used by /api/auth/me and the /api/tournaments list/create
// endpoints, which by definition run before a tournament is selected.
export function requireUserAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifySession(token);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
