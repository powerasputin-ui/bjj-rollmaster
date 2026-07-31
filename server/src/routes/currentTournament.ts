import { Router } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { signSession } from '../lib/jwt.js';
import { rowToTournament, type TournamentRow } from './tournaments.js';

const VALID_MATS = ['1', '2', '3', '4', '5'];

// Separate from tournamentsRouter (which requires a user-token) because this
// needs a tournament-token instead — used by the frontend to restore the
// active tournament's details (name/slug/etc.) after a page reload, when all
// it has is the tournament-scoped session token.
export const currentTournamentRouter = Router();
currentTournamentRouter.use(requireAuth);

currentTournamentRouter.get('/', (req, res) => {
  const row = getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(req.tournamentId) as TournamentRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(rowToTournament(row));
});

// Mints a short-lived (1 day) mat-scoped token an organizer can hand to a
// mat referee/scorekeeper — narrower than the organizer's own tournament-token
// (see requireAuthOrMat.ts): usable only to finish matches on this one mat.
currentTournamentRouter.post('/mats/:mat/token', (req, res) => {
  if (!VALID_MATS.includes(req.params.mat)) {
    res.status(400).json({ error: 'invalid_mat' });
    return;
  }
  const token = signSession(
    { sub: req.userId, kind: 'mat', tournamentId: req.tournamentId, mat: req.params.mat, email: '' },
    { expiresIn: '1d' }
  );
  res.json({ token });
});
