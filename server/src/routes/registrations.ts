import { Router } from 'express';
import { getDb, rowToCompetitor } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendRegistrationDecisionEmail } from '../lib/email.js';

export const registrationsRouter = Router();

registrationsRouter.use(requireAuth);

// Unconfirmed emails (athlete hasn't clicked the verification link yet) never
// show up here — keeps random/fake addresses out of the organizer's queue.
registrationsRouter.get('/pending', (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM competitors WHERE tournament_id = ? AND status = 'pending' AND email_verified_at IS NOT NULL ORDER BY created_at ASC")
    .all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToCompetitor>[0][]).map(rowToCompetitor));
});

registrationsRouter.post('/:id/approve', async (req, res) => {
  const db = getDb();
  const result = db
    .prepare("UPDATE competitors SET status = 'approved' WHERE id = ? AND tournament_id = ? AND status = 'pending'")
    .run(req.params.id, req.tournamentId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const row = db
    .prepare(
      `SELECT c.email, t.name as tournament_name FROM competitors c
       JOIN tournaments t ON t.id = c.tournament_id
       WHERE c.id = ?`
    )
    .get(req.params.id) as { email: string | null; tournament_name: string } | undefined;
  if (row?.email) await sendRegistrationDecisionEmail(row.email, row.tournament_name, true);

  res.status(200).json({ ok: true });
});

registrationsRouter.post('/:id/reject', async (req, res) => {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.email, t.name as tournament_name FROM competitors c
       JOIN tournaments t ON t.id = c.tournament_id
       WHERE c.id = ? AND c.tournament_id = ? AND c.status = 'pending'`
    )
    .get(req.params.id, req.tournamentId) as { email: string | null; tournament_name: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  db.prepare("DELETE FROM competitors WHERE id = ? AND tournament_id = ? AND status = 'pending'").run(req.params.id, req.tournamentId);

  if (row.email) await sendRegistrationDecisionEmail(row.email, row.tournament_name, false);

  res.status(200).json({ ok: true });
});
