import { Router } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { rowToTournament, type TournamentRow } from './tournaments.js';

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
