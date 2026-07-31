import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb, getTimerConfigRow, rowToCompetitor, rowToMatch } from '../db/client.js';
import { isValidNewCompetitor } from '../validation.js';

export const publicRouter = Router({ mergeParams: true });

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function resolveTournamentId(slug: string): string | undefined {
  const row = getDb().prepare('SELECT id FROM tournaments WHERE slug = ?').get(slug) as { id: string } | undefined;
  return row?.id;
}

// Public catalog — the athlete-facing home page browses this to find a
// tournament to register for, instead of needing a private link.
publicRouter.get('/tournaments', (_req, res) => {
  const rows = getDb()
    .prepare(
      "SELECT id, name, slug, event_date, location FROM tournaments WHERE status = 'published' ORDER BY (event_date IS NULL) ASC, event_date ASC"
    )
    .all() as { id: string; name: string; slug: string; event_date: string | null; location: string | null }[];
  res.json(rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, eventDate: r.event_date, location: r.location })));
});

publicRouter.param('slug', (req, res, next, slug) => {
  const tournamentId = resolveTournamentId(slug);
  if (!tournamentId) {
    res.status(404).json({ error: 'tournament_not_found' });
    return;
  }
  req.tournamentId = tournamentId;
  next();
});

publicRouter.get('/:slug/competitors', (req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM competitors WHERE tournament_id = ? AND status = 'approved' ORDER BY created_at ASC")
    .all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToCompetitor>[0][]).map(rowToCompetitor));
});

publicRouter.get('/:slug/matches', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM matches WHERE tournament_id = ?').all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToMatch>[0][]).map(rowToMatch));
});

publicRouter.get('/:slug/timer-config', (req, res) => {
  res.json(getTimerConfigRow(req.tournamentId));
});

publicRouter.post('/:slug/registrations', registerLimiter, (req, res) => {
  if (!isValidNewCompetitor(req.body)) {
    res.status(400).json({ error: 'invalid_registration' });
    return;
  }
  const c = req.body;
  getDb()
    .prepare(
      `INSERT INTO competitors (id, tournament_id, name, belt, weight, team, age_group, is_absolute, made_weight, status)
       VALUES (@id, @tournamentId, @name, @belt, @weight, @team, @ageGroup, @isAbsolute, 0, 'pending')`
    )
    .run({ ...c, tournamentId: req.tournamentId, isAbsolute: c.isAbsolute ? 1 : 0 });
  res.status(201).json({ ok: true });
});
