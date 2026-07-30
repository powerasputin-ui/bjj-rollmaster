import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/jwt.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifySession(token);
    req.tournamentId = payload.tournamentId;
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
