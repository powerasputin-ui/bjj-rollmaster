import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { Competitor, Match, MatchEvent, Score, TimerConfig } from '../types.js';
import { SCHEMA_SQL } from './schema.js';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbPath = process.env.DB_PATH || './data/rollmaster.db';
  const resolvedPath = dbPath === ':memory:' ? dbPath : path.resolve(dbPath);
  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  dbInstance = new Database(resolvedPath);
  dbInstance.exec(SCHEMA_SQL);
  return dbInstance;
}

export function closeDb(): void {
  dbInstance?.close();
  dbInstance = null;
}

interface CompetitorRow {
  id: string;
  name: string;
  belt: string;
  weight: string;
  team: string;
  age_group: string;
  is_absolute: number;
  made_weight: number;
  status: string;
}

export function rowToCompetitor(row: CompetitorRow): Competitor {
  return {
    id: row.id,
    name: row.name,
    belt: row.belt as Competitor['belt'],
    weight: row.weight,
    team: row.team,
    ageGroup: row.age_group as Competitor['ageGroup'],
    isAbsolute: !!row.is_absolute,
    madeWeight: !!row.made_weight,
    status: row.status as Competitor['status'],
  };
}

interface MatchRow {
  id: string;
  competitor1_id: string | null;
  competitor2_id: string | null;
  score1: string;
  score2: string;
  status: string;
  winner_id: string | null;
  win_method: string | null;
  round: number;
  bracket_id: string;
  next_match_id: string | null;
  mat: string | null;
  logs: string;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToMatch(row: MatchRow): Match {
  const match: Match = {
    id: row.id,
    competitor1Id: row.competitor1_id,
    competitor2Id: row.competitor2_id,
    score1: safeJsonParse<Score>(row.score1, { points: 0, advantages: 0, penalties: 0 }),
    score2: safeJsonParse<Score>(row.score2, { points: 0, advantages: 0, penalties: 0 }),
    status: row.status as Match['status'],
    round: row.round,
    bracketId: row.bracket_id,
    logs: safeJsonParse<MatchEvent[]>(row.logs, []),
  };
  if (row.winner_id) match.winnerId = row.winner_id;
  if (row.win_method) match.winMethod = row.win_method;
  if (row.next_match_id) match.nextMatchId = row.next_match_id;
  if (row.mat) match.mat = row.mat;
  return match;
}

const DEFAULT_TIMER_CONFIG: TimerConfig = { roundDuration: 300, restDuration: 60, rounds: 1 };

export function getTimerConfigRow(tournamentId: string): TimerConfig {
  const row = getDb()
    .prepare('SELECT round_duration, rest_duration, rounds FROM timer_config WHERE tournament_id = ?')
    .get(tournamentId) as { round_duration: number; rest_duration: number; rounds: number } | undefined;
  if (!row) return DEFAULT_TIMER_CONFIG;
  return { roundDuration: row.round_duration, restDuration: row.rest_duration, rounds: row.rounds };
}

export function createTimerConfigRow(tournamentId: string): void {
  getDb()
    .prepare('INSERT INTO timer_config (tournament_id, round_duration, rest_duration, rounds) VALUES (?, ?, ?, ?)')
    .run(tournamentId, DEFAULT_TIMER_CONFIG.roundDuration, DEFAULT_TIMER_CONFIG.restDuration, DEFAULT_TIMER_CONFIG.rounds);
}
