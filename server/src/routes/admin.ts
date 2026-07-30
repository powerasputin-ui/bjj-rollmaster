import { Router } from 'express';
import { getDb, rowToCompetitor, rowToMatch } from '../db/client.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { isValidNewCompetitor, isValidMatch, isValidTimerConfig } from '../validation.js';
import type { Competitor, Match } from '../types.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

// Full-state replace — backs the existing Export/Import JSON feature, letting
// operators migrate data that was previously only ever stored in localStorage.
// Every delete/insert below is scoped to req.tournamentId — this must never
// touch other tenants' rows.
adminRouter.post('/import', (req, res) => {
  const body = req.body as { competitors?: unknown; matches?: unknown; timerConfig?: unknown };

  if (!Array.isArray(body.competitors) || !body.competitors.every(isValidNewCompetitor)) {
    res.status(400).json({ error: 'invalid_competitors' });
    return;
  }
  const matches = Array.isArray(body.matches) ? body.matches : [];
  if (!matches.every(isValidMatch)) {
    res.status(400).json({ error: 'invalid_matches' });
    return;
  }
  if (body.timerConfig !== undefined && !isValidTimerConfig(body.timerConfig)) {
    res.status(400).json({ error: 'invalid_timer_config' });
    return;
  }

  const competitors = body.competitors as Competitor[];
  const validMatches = matches as Match[];
  const tournamentId = req.tournamentId;
  const db = getDb();

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournamentId);
    db.prepare('DELETE FROM competitors WHERE tournament_id = ?').run(tournamentId);

    const insertCompetitor = db.prepare(
      `INSERT INTO competitors (id, tournament_id, name, belt, weight, team, age_group, is_absolute, made_weight, status)
       VALUES (@id, @tournamentId, @name, @belt, @weight, @team, @ageGroup, @isAbsolute, @madeWeight, 'approved')`
    );
    competitors.forEach(c => insertCompetitor.run({
      ...c,
      tournamentId,
      isAbsolute: c.isAbsolute ? 1 : 0,
      madeWeight: c.madeWeight ? 1 : 0,
    }));

    const insertMatch = db.prepare(
      `INSERT INTO matches (id, tournament_id, competitor1_id, competitor2_id, score1, score2, status, winner_id, win_method, round, bracket_id, next_match_id, mat, logs)
       VALUES (@id, @tournamentId, @competitor1Id, @competitor2Id, @score1, @score2, @status, @winnerId, @winMethod, @round, @bracketId, @nextMatchId, @mat, @logs)`
    );
    validMatches.forEach(m => insertMatch.run({
      id: m.id,
      tournamentId,
      competitor1Id: m.competitor1Id ?? null,
      competitor2Id: m.competitor2Id ?? null,
      score1: JSON.stringify(m.score1 ?? { points: 0, advantages: 0, penalties: 0 }),
      score2: JSON.stringify(m.score2 ?? { points: 0, advantages: 0, penalties: 0 }),
      status: m.status,
      winnerId: m.winnerId ?? null,
      winMethod: m.winMethod ?? null,
      round: m.round,
      bracketId: m.bracketId,
      nextMatchId: m.nextMatchId ?? null,
      mat: m.mat ?? null,
      logs: JSON.stringify(m.logs ?? []),
    }));

    if (body.timerConfig) {
      const tc = body.timerConfig as { roundDuration: number; restDuration: number; rounds: number };
      db.prepare('UPDATE timer_config SET round_duration = ?, rest_duration = ?, rounds = ? WHERE tournament_id = ?')
        .run(tc.roundDuration, tc.restDuration, tc.rounds, tournamentId);
    }
  });
  tx();

  const competitorRows = db.prepare("SELECT * FROM competitors WHERE tournament_id = ? AND status = 'approved'").all(tournamentId);
  const matchRows = db.prepare('SELECT * FROM matches WHERE tournament_id = ?').all(tournamentId);
  res.json({
    competitors: (competitorRows as Parameters<typeof rowToCompetitor>[0][]).map(rowToCompetitor),
    matches: (matchRows as Parameters<typeof rowToMatch>[0][]).map(rowToMatch),
  });
});

adminRouter.post('/reset', (req, res) => {
  const tournamentId = req.tournamentId;
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournamentId);
    db.prepare('DELETE FROM competitors WHERE tournament_id = ?').run(tournamentId);
    db.prepare('UPDATE timer_config SET round_duration = 300, rest_duration = 60, rounds = 1 WHERE tournament_id = ?').run(tournamentId);
  });
  tx();
  res.status(204).end();
});
