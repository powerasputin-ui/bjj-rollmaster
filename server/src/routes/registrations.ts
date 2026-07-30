import { Router } from 'express';
import { getDb, rowToCompetitor } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const registrationsRouter = Router();

registrationsRouter.use(requireAuth);

registrationsRouter.get('/pending', (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM competitors WHERE tournament_id = ? AND status = 'pending' ORDER BY created_at ASC")
    .all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToCompetitor>[0][]).map(rowToCompetitor));
});

registrationsRouter.post('/:id/approve', (req, res) => {
  const result = getDb()
    .prepare("UPDATE competitors SET status = 'approved' WHERE id = ? AND tournament_id = ? AND status = 'pending'")
    .run(req.params.id, req.tournamentId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({ ok: true });
});

registrationsRouter.post('/:id/reject', (req, res) => {
  const result = getDb()
    .prepare("DELETE FROM competitors WHERE id = ? AND tournament_id = ? AND status = 'pending'")
    .run(req.params.id, req.tournamentId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({ ok: true });
});
