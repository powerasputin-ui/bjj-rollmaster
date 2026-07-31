import { Router } from 'express';
import { getDb, rowToMatch } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAuthOrMat } from '../middleware/requireAuthOrMat.js';
import { isValidMatch } from '../validation.js';
import { broadcastMatchCalled } from '../ws/matSync.js';
import type { Match, MatchEvent, Score } from '../types.js';

export const matchesRouter = Router();

function insertMatch(m: Match, tournamentId: string): void {
  getDb()
    .prepare(
      `INSERT INTO matches (id, tournament_id, competitor1_id, competitor2_id, score1, score2, status, winner_id, win_method, round, bracket_id, next_match_id, mat, logs, format, bracket_section, loser_next_match_id, next_match_slot, loser_next_match_slot)
       VALUES (@id, @tournamentId, @competitor1Id, @competitor2Id, @score1, @score2, @status, @winnerId, @winMethod, @round, @bracketId, @nextMatchId, @mat, @logs, @format, @bracketSection, @loserNextMatchId, @nextMatchSlot, @loserNextMatchSlot)`
    )
    .run({
      id: m.id,
      tournamentId,
      competitor1Id: m.competitor1Id ?? null,
      competitor2Id: m.competitor2Id ?? null,
      score1: JSON.stringify(m.score1),
      score2: JSON.stringify(m.score2),
      status: m.status,
      winnerId: m.winnerId ?? null,
      winMethod: m.winMethod ?? null,
      round: m.round,
      bracketId: m.bracketId,
      nextMatchId: m.nextMatchId ?? null,
      mat: m.mat ?? null,
      logs: JSON.stringify(m.logs ?? []),
      format: m.format ?? null,
      bracketSection: m.bracketSection ?? null,
      loserNextMatchId: m.loserNextMatchId ?? null,
      nextMatchSlot: m.nextMatchSlot ?? null,
      loserNextMatchSlot: m.loserNextMatchSlot ?? null,
    });
}

matchesRouter.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM matches WHERE tournament_id = ?').all(req.tournamentId);
  res.json((rows as Parameters<typeof rowToMatch>[0][]).map(rowToMatch));
});

// Bulk-replaces every match belonging to one bracket category — used by bracket generation,
// which always recomputes the whole category's match tree from scratch client-side.
matchesRouter.put('/bracket/:bracketId', requireAuth, (req, res) => {
  const body = req.body as { matches?: unknown };
  if (!Array.isArray(body.matches) || !body.matches.every(isValidMatch)) {
    res.status(400).json({ error: 'invalid_matches' });
    return;
  }
  const bracketId = req.params.bracketId;
  const matches = body.matches as Match[];
  const tournamentId = req.tournamentId;

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE bracket_id = ? AND tournament_id = ?').run(bracketId, tournamentId);
    matches.forEach(m => insertMatch(m, tournamentId));
  });
  tx();

  const rows = db.prepare('SELECT * FROM matches WHERE bracket_id = ? AND tournament_id = ?').all(bracketId, tournamentId);
  res.status(201).json((rows as Parameters<typeof rowToMatch>[0][]).map(rowToMatch));
});

matchesRouter.post('/:id/call-to-mat', requireAuth, (req, res) => {
  const mat = req.body?.mat;
  if (typeof mat !== 'string' || !mat) {
    res.status(400).json({ error: 'invalid_mat' });
    return;
  }
  const db = getDb();
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId);
  if (!match) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE matches SET status = 'pending' WHERE tournament_id = ? AND mat = ? AND status = 'ongoing'").run(req.tournamentId, mat);
    db.prepare("UPDATE matches SET mat = ?, status = 'ongoing' WHERE id = ? AND tournament_id = ?").run(mat, req.params.id, req.tournamentId);
  });
  tx();

  const row = db.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId);
  const called = rowToMatch(row as Parameters<typeof rowToMatch>[0]);
  broadcastMatchCalled(req.tournamentId, {
    matchId: called.id,
    competitor1Id: called.competitor1Id,
    competitor2Id: called.competitor2Id,
    mat,
  });
  res.json(called);
});

interface FinishBody {
  winnerId: string;
  method: string;
  score1: Score;
  score2: Score;
  logs: MatchEvent[];
}

function isFinishBody(b: unknown): b is FinishBody {
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  return typeof o.winnerId === 'string' && typeof o.method === 'string';
}

matchesRouter.post('/:id/finish', requireAuthOrMat, (req, res) => {
  if (!isFinishBody(req.body)) {
    res.status(400).json({ error: 'invalid_finish_body' });
    return;
  }
  const { winnerId, method, score1, score2, logs } = req.body;
  const db = getDb();
  const current = db.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId) as
    | {
        id: string;
        competitor1_id: string | null;
        competitor2_id: string | null;
        next_match_id: string | null;
        mat: string | null;
        loser_next_match_id: string | null;
        next_match_slot: number | null;
        loser_next_match_slot: number | null;
      }
    | undefined;
  if (!current) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  // A mat-token may only finish matches currently assigned to its own mat —
  // req.mat is unset for a full organizer tournament-token, which is
  // unrestricted (see requireAuthOrMat.ts).
  if (req.mat && current.mat !== req.mat) {
    res.status(403).json({ error: 'wrong_mat' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE matches SET winner_id = ?, win_method = ?, score1 = ?, score2 = ?, logs = ?, status = 'finished' WHERE id = ? AND tournament_id = ?`
    ).run(
      winnerId,
      method,
      JSON.stringify(score1 ?? { points: 0, advantages: 0, penalties: 0 }),
      JSON.stringify(score2 ?? { points: 0, advantages: 0, penalties: 0 }),
      JSON.stringify(logs ?? []),
      req.params.id,
      req.tournamentId
    );

    if (current.next_match_id) {
      // Prefer the explicit next_match_slot (set by double-elim/round-robin
      // generation); legacy single-elim matches never set it, so fall back to
      // the same trailing "idx" parity convention the client has always used.
      const isFirst = current.next_match_slot
        ? current.next_match_slot === 1
        : parseInt(current.id.split('idx').pop() || '0', 10) % 2 === 0;
      const column = isFirst ? 'competitor1_id' : 'competitor2_id';
      db.prepare(`UPDATE matches SET ${column} = ? WHERE id = ? AND tournament_id = ?`).run(winnerId, current.next_match_id, req.tournamentId);
    }

    if (current.loser_next_match_id && current.competitor1_id && current.competitor2_id) {
      const loserId = winnerId === current.competitor1_id ? current.competitor2_id : current.competitor1_id;
      const column = current.loser_next_match_slot === 2 ? 'competitor2_id' : 'competitor1_id';
      db.prepare(`UPDATE matches SET ${column} = ? WHERE id = ? AND tournament_id = ?`).run(loserId, current.loser_next_match_id, req.tournamentId);
    }
  });
  tx();

  const row = db.prepare('SELECT * FROM matches WHERE id = ? AND tournament_id = ?').get(req.params.id, req.tournamentId);
  res.json(rowToMatch(row as Parameters<typeof rowToMatch>[0]));
});
