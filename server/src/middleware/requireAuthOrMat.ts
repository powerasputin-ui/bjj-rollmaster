import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '../lib/jwt.js';

// Accepts either a full organizer tournament-token (unrestricted within the
// tournament) or a narrow mat-token (scoped to one mat — req.mat is set so
// the route handler can enforce the mat-ownership check itself). Used only
// on the one route a mat referee actually needs: POST /matches/:id/finish.
export function requireAuthOrMat(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    const payload = verifySession(token);
    if (payload.kind === 'tournament' && payload.tournamentId) {
      req.tournamentId = payload.tournamentId;
      req.userId = payload.sub;
      next();
      return;
    }
    if (payload.kind === 'mat' && payload.tournamentId && payload.mat) {
      req.tournamentId = payload.tournamentId;
      req.mat = payload.mat;
      next();
      return;
    }
    res.status(401).json({ error: 'unauthorized' });
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}
