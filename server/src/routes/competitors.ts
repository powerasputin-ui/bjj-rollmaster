import { Router } from 'express';
import { getDb, rowToCompetitor } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidNewCompetitor } from '../validation.js';

export const competitorsRouter = Router();

competitorsRouter.use(requireAuth);

competitorsRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM competitors WHERE tournament_id = ? AND status = 'approved' ORDER BY created_at ASC")
    .all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToCompetitor>[0][]).map(rowToCompetitor));
});

competitorsRouter.post('/', (req, res) => {
  if (!isValidNewCompetitor(req.body)) {
    res.status(400).json({ error: 'invalid_competitor' });
    return;
  }
  const c = req.body;
  getDb()
    .prepare(
      `INSERT INTO competitors (id, tournament_id, name, belt, weight, team, age_group, is_absolute, made_weight, status)
       VALUES (@id, @tournamentId, @name, @belt, @weight, @team, @ageGroup, @isAbsolute, 0, 'approved')`
    )
    .run({ ...c, tournamentId: req.tournamentId, isAbsolute: c.isAbsolute ? 1 : 0 });

  const row = getDb().prepare('SELECT * FROM competitors WHERE id = ? AND tournament_id = ?').get(c.id, req.tournamentId);
  res.status(201).json(rowToCompetitor(row as Parameters<typeof rowToCompetitor>[0]));
});

competitorsRouter.patch('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM competitors WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId);
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const fields: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id, tournamentId: req.tournamentId };

  if (typeof body.madeWeight === 'boolean') {
    fields.push('made_weight = @madeWeight');
    params.madeWeight = body.madeWeight ? 1 : 0;
  }
  if (typeof body.isAbsolute === 'boolean') {
    fields.push('is_absolute = @isAbsolute');
    params.isAbsolute = body.isAbsolute ? 1 : 0;
  }
  if (typeof body.weight === 'string') {
    fields.push('weight = @weight');
    params.weight = body.weight;
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'no_valid_fields' });
    return;
  }

  getDb().prepare(`UPDATE competitors SET ${fields.join(', ')} WHERE id = @id AND tournament_id = @tournamentId`).run(params);
  const row = getDb().prepare('SELECT * FROM competitors WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId);
  res.json(rowToCompetitor(row as Parameters<typeof rowToCompetitor>[0]));
});

competitorsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const tx = db.transaction((id: string, tournamentId: string) => {
    db.prepare('DELETE FROM matches WHERE tournament_id = ? AND (competitor1_id = ? OR competitor2_id = ?)').run(tournamentId, id, id);
    db.prepare('DELETE FROM competitors WHERE id = ? AND tournament_id = ?').run(id, tournamentId);
  });
  tx(req.params.id, req.tournamentId);
  res.status(204).end();
});
