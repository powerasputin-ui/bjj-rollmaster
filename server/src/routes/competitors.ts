import { Router } from 'express';
import { getDb, rowToCompetitor } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidNewCompetitor, isValidBelt, isValidAgeGroup } from '../validation.js';

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
      `INSERT INTO competitors (id, tournament_id, name, belt, weight, team, age_group, is_absolute, made_weight, competes_gi, competes_nogi, age_category_id, status)
       VALUES (@id, @tournamentId, @name, @belt, @weight, @team, @ageGroup, @isAbsolute, 0, @competesGi, @competesNoGi, @ageCategoryId, 'approved')`
    )
    .run({
      ...c,
      tournamentId: req.tournamentId,
      isAbsolute: c.isAbsolute ? 1 : 0,
      // Default gi-only when the caller doesn't specify — matches the schema
      // default and keeps single-format tournaments (the common case) a no-op.
      competesGi: c.competesGi === undefined ? 1 : (c.competesGi ? 1 : 0),
      competesNoGi: c.competesNoGi === undefined ? 0 : (c.competesNoGi ? 1 : 0),
      ageCategoryId: c.ageCategoryId ?? null,
    });

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
  if (typeof body.competesGi === 'boolean') {
    fields.push('competes_gi = @competesGi');
    params.competesGi = body.competesGi ? 1 : 0;
  }
  if (typeof body.competesNoGi === 'boolean') {
    fields.push('competes_nogi = @competesNoGi');
    params.competesNoGi = body.competesNoGi ? 1 : 0;
  }
  if (typeof body.weight === 'string') {
    fields.push('weight = @weight');
    params.weight = body.weight;
  }
  // Lets an organizer move an athlete into a different age or weight
  // category (e.g. nobody else showed up in their bracket) — mirrors
  // Smoothcomp's "move registrations" tool, applied here directly as a field
  // edit since ageGroup/weight/belt are exactly what determines bucketing.
  if (isValidBelt(body.belt)) {
    fields.push('belt = @belt');
    params.belt = body.belt;
  }
  if (isValidAgeGroup(body.ageGroup)) {
    fields.push('age_group = @ageGroup');
    params.ageGroup = body.ageGroup;
  }
  if (typeof body.ageCategoryId === 'string' || body.ageCategoryId === null) {
    fields.push('age_category_id = @ageCategoryId');
    params.ageCategoryId = body.ageCategoryId;
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
