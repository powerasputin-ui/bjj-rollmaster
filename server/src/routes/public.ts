import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getDb, getTimerConfigRow, getWeightCategoryRows, getAgeCategoryRows, rowToCompetitor, rowToMatch } from '../db/client.js';
import { isValidNewCompetitor, isValidEmail } from '../validation.js';
import { requireAthleteAuth } from '../middleware/requireAthleteAuth.js';
import { signSession } from '../lib/jwt.js';
import { sendRegistrationVerificationEmail, sendAthleteLoginEmail } from '../lib/email.js';

export const publicRouter = Router({ mergeParams: true });

const VERIFY_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const athleteAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
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

interface CompetitorRow {
  id: string;
  name: string;
  belt: string;
  weight: string;
  team: string;
  age_group: string;
  is_absolute: number;
  made_weight: number;
  competes_gi: number;
  competes_nogi: number;
  age_category_id: string | null;
  status: string;
}

// --- Athlete accounts (global identity, not scoped to any one tournament) ---
// Passwordless: a magic link both confirms a registration's email and signs
// the athlete into their cabinet in one click.

publicRouter.post('/verify-registration', athleteAuthLimiter, (req, res) => {
  const { token } = req.body as { token?: unknown };
  if (typeof token !== 'string' || !token) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const db = getDb();
  const competitor = db
    .prepare("SELECT id, athlete_id, email FROM competitors WHERE email_verify_token = ? AND email_verify_token_expires > datetime('now')")
    .get(token) as { id: string; athlete_id: string | null; email: string | null } | undefined;
  if (!competitor || !competitor.athlete_id || !competitor.email) {
    res.status(400).json({ error: 'invalid_or_expired_token' });
    return;
  }

  db.prepare(
    "UPDATE competitors SET email_verified_at = datetime('now'), email_verify_token = NULL, email_verify_token_expires = NULL WHERE id = ?"
  ).run(competitor.id);

  const sessionToken = signSession({ sub: competitor.athlete_id, kind: 'athlete', email: competitor.email });
  res.json({ token: sessionToken });
});

publicRouter.post('/athlete/request-login', athleteAuthLimiter, async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (isValidEmail(email)) {
    const db = getDb();
    const athlete = db.prepare('SELECT id FROM athletes WHERE email = ?').get(email) as { id: string } | undefined;
    if (athlete) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();
      db.prepare('UPDATE athletes SET login_token = ?, login_token_expires = ? WHERE id = ?').run(token, expires, athlete.id);
      const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
      await sendAthleteLoginEmail(email, `${baseUrl}/?athleteLogin=${token}`);
      if (process.env.NODE_ENV !== 'production') {
        res.json({ ok: true, devLoginToken: token });
        return;
      }
    }
  }
  // Always the same response whether or not the email has a registration — no enumeration.
  res.json({ ok: true });
});

publicRouter.post('/athlete/login', athleteAuthLimiter, (req, res) => {
  const { token } = req.body as { token?: unknown };
  if (typeof token !== 'string' || !token) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const db = getDb();
  const athlete = db
    .prepare("SELECT id, email FROM athletes WHERE login_token = ? AND login_token_expires > datetime('now')")
    .get(token) as { id: string; email: string } | undefined;
  if (!athlete) {
    res.status(400).json({ error: 'invalid_or_expired_token' });
    return;
  }

  db.prepare('UPDATE athletes SET login_token = NULL, login_token_expires = NULL WHERE id = ?').run(athlete.id);
  const sessionToken = signSession({ sub: athlete.id, kind: 'athlete', email: athlete.email });
  res.json({ token: sessionToken });
});

publicRouter.get('/athlete/me', requireAthleteAuth, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT c.*, t.name as tournament_name, t.slug as tournament_slug
       FROM competitors c JOIN tournaments t ON t.id = c.tournament_id
       WHERE c.athlete_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.athleteId) as (CompetitorRow & { tournament_id: string; tournament_name: string; tournament_slug: string })[];

  res.json(
    rows.map(row => ({
      ...rowToCompetitor(row),
      tournamentName: row.tournament_name,
      tournamentSlug: row.tournament_slug,
    }))
  );
});

publicRouter.patch('/athlete/registrations/:id', requireAthleteAuth, (req, res) => {
  const existing = getDb()
    .prepare("SELECT * FROM competitors WHERE id = ? AND athlete_id = ? AND status = 'pending'")
    .get(req.params.id, req.athleteId);
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const candidate = { ...(req.body as object), id: req.params.id };
  if (!isValidNewCompetitor(candidate)) {
    res.status(400).json({ error: 'invalid_registration' });
    return;
  }
  const c = candidate;

  getDb()
    .prepare(
      `UPDATE competitors SET name = @name, belt = @belt, weight = @weight, team = @team, age_group = @ageGroup, is_absolute = @isAbsolute, competes_gi = @competesGi, competes_nogi = @competesNoGi, age_category_id = @ageCategoryId
       WHERE id = @id AND athlete_id = @athleteId`
    )
    .run({
      id: req.params.id,
      athleteId: req.athleteId,
      name: c.name,
      belt: c.belt,
      weight: c.weight,
      team: c.team,
      ageGroup: c.ageGroup,
      isAbsolute: c.isAbsolute ? 1 : 0,
      competesGi: c.competesGi === undefined ? 1 : (c.competesGi ? 1 : 0),
      competesNoGi: c.competesNoGi === undefined ? 0 : (c.competesNoGi ? 1 : 0),
      ageCategoryId: c.ageCategoryId ?? null,
    });

  const row = getDb().prepare('SELECT * FROM competitors WHERE id = ?').get(req.params.id) as CompetitorRow;
  res.json(rowToCompetitor(row));
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

publicRouter.get('/:slug', (req, res) => {
  const row = getDb().prepare('SELECT name, sparring_format FROM tournaments WHERE id = ?').get(req.tournamentId) as { name: string; sparring_format: string };
  res.json({ name: row.name, sparringFormat: row.sparring_format });
});

publicRouter.get('/:slug/weight-categories', (req, res) => {
  res.json(getWeightCategoryRows(req.tournamentId));
});

publicRouter.get('/:slug/age-categories', (req, res) => {
  res.json(getAgeCategoryRows(req.tournamentId));
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

publicRouter.post('/:slug/registrations', registerLimiter, async (req, res) => {
  const { email } = req.body as { email?: unknown };
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'invalid_email' });
    return;
  }
  if (!isValidNewCompetitor(req.body)) {
    res.status(400).json({ error: 'invalid_registration' });
    return;
  }

  const db = getDb();
  const tournament = db.prepare('SELECT name FROM tournaments WHERE id = ?').get(req.tournamentId) as { name: string };

  let athlete = db.prepare('SELECT id FROM athletes WHERE email = ?').get(email) as { id: string } | undefined;
  if (!athlete) {
    const athleteId = crypto.randomUUID();
    db.prepare('INSERT INTO athletes (id, email, name) VALUES (?, ?, ?)').run(athleteId, email, req.body.name);
    athlete = { id: athleteId };
  }

  const c = req.body;
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO competitors (id, tournament_id, athlete_id, email, email_verify_token, email_verify_token_expires, name, belt, weight, team, age_group, is_absolute, made_weight, competes_gi, competes_nogi, age_category_id, status)
     VALUES (@id, @tournamentId, @athleteId, @email, @verifyToken, @verifyExpires, @name, @belt, @weight, @team, @ageGroup, @isAbsolute, 0, @competesGi, @competesNoGi, @ageCategoryId, 'pending')`
  ).run({
    ...c,
    tournamentId: req.tournamentId,
    athleteId: athlete.id,
    email,
    verifyToken,
    verifyExpires,
    isAbsolute: c.isAbsolute ? 1 : 0,
    competesGi: c.competesGi === undefined ? 1 : (c.competesGi ? 1 : 0),
    competesNoGi: c.competesNoGi === undefined ? 0 : (c.competesNoGi ? 1 : 0),
    ageCategoryId: c.ageCategoryId ?? null,
  });

  const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
  await sendRegistrationVerificationEmail(email, `${baseUrl}/?confirmEmail=${verifyToken}`, tournament.name);

  if (process.env.NODE_ENV !== 'production') {
    res.status(201).json({ ok: true, devVerifyToken: verifyToken });
    return;
  }
  res.status(201).json({ ok: true });
});
