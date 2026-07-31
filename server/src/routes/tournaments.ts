import crypto from 'node:crypto';
import { Router } from 'express';
import { getDb, createTimerConfigRow } from '../db/client.js';
import { requireUserAuth } from '../middleware/requireUserAuth.js';
import { signSession } from '../lib/jwt.js';
import { slugify } from '../lib/slug.js';

export const tournamentsRouter = Router();
tournamentsRouter.use(requireUserAuth);

export interface TournamentRow {
  id: string;
  name: string;
  slug: string;
  event_date: string | null;
  location: string | null;
  description: string | null;
  status: string;
}

export interface TournamentOut {
  id: string;
  name: string;
  slug: string;
  eventDate: string | null;
  location: string | null;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
}

export function rowToTournament(row: TournamentRow): TournamentOut {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    eventDate: row.event_date,
    location: row.location,
    description: row.description,
    status: row.status as TournamentOut['status'],
  };
}

function emailForUser(userId: string): string {
  const row = getDb().prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  return row?.email ?? '';
}

interface TournamentInput {
  name: string;
  eventDate?: string | null;
  location?: string | null;
  description?: string | null;
}

function isValidTournamentInput(body: unknown): body is TournamentInput {
  if (!body || typeof body !== 'object') return false;
  const o = body as Record<string, unknown>;
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 200) return false;
  if (o.eventDate !== undefined && o.eventDate !== null && typeof o.eventDate !== 'string') return false;
  if (o.location !== undefined && o.location !== null && typeof o.location !== 'string') return false;
  if (o.description !== undefined && o.description !== null && typeof o.description !== 'string') return false;
  return true;
}

// Ordered soonest-upcoming first; tournaments with no date sort last.
tournamentsRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM tournaments WHERE owner_user_id = ? ORDER BY (event_date IS NULL) ASC, event_date ASC, created_at DESC')
    .all(req.userId);
  res.json((rows as TournamentRow[]).map(rowToTournament));
});

tournamentsRouter.post('/', (req, res) => {
  if (!isValidTournamentInput(req.body)) {
    res.status(400).json({ error: 'invalid_tournament' });
    return;
  }
  const { name, eventDate, location, description } = req.body;
  const db = getDb();
  const id = crypto.randomUUID();
  const slug = slugify(name.trim());

  try {
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO tournaments (id, owner_user_id, name, slug, event_date, location, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, req.userId, name.trim(), slug, eventDate ?? null, location ?? null, description ?? null);
      createTimerConfigRow(id);
    });
    tx();
  } catch (err) {
    console.error('Create tournament failed', err);
    res.status(500).json({ error: 'internal_error' });
    return;
  }

  const row = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as TournamentRow;
  const token = signSession({ sub: req.userId, tournamentId: id, email: emailForUser(req.userId) });
  res.status(201).json({ token, tournament: rowToTournament(row) });
});

// Mints a tournament-scoped token for one of this user's existing
// tournaments — 404 (not 403) on someone else's id, so we don't confirm
// whether that id exists at all.
tournamentsRouter.post('/:id/select', (req, res) => {
  const row = getDb()
    .prepare('SELECT * FROM tournaments WHERE id = ? AND owner_user_id = ?')
    .get(req.params.id, req.userId) as TournamentRow | undefined;
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const token = signSession({ sub: req.userId, tournamentId: row.id, email: emailForUser(req.userId) });
  res.json({ token, tournament: rowToTournament(row) });
});

tournamentsRouter.patch('/:id', (req, res) => {
  const existing = getDb()
    .prepare('SELECT * FROM tournaments WHERE id = ? AND owner_user_id = ?')
    .get(req.params.id, req.userId);
  if (!existing) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const fields: string[] = [];
  const params: Record<string, unknown> = { id: req.params.id };

  if (typeof body.name === 'string' && body.name.trim() && body.name.length <= 200) {
    fields.push('name = @name');
    params.name = body.name.trim();
  }
  if (body.eventDate === null || typeof body.eventDate === 'string') {
    fields.push('event_date = @eventDate');
    params.eventDate = body.eventDate ?? null;
  }
  if (body.location === null || typeof body.location === 'string') {
    fields.push('location = @location');
    params.location = body.location ?? null;
  }
  if (body.description === null || typeof body.description === 'string') {
    fields.push('description = @description');
    params.description = body.description ?? null;
  }
  if (body.status === 'draft' || body.status === 'published' || body.status === 'archived') {
    fields.push('status = @status');
    params.status = body.status;
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'no_valid_fields' });
    return;
  }

  getDb().prepare(`UPDATE tournaments SET ${fields.join(', ')} WHERE id = @id`).run(params);
  const row = getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id) as TournamentRow;
  res.json(rowToTournament(row));
});
