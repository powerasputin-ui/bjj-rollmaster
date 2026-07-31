import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AgeCategory, AgeGroup, Competitor, Match, MatchEvent, Score, TimerConfig, WeightCategory } from '../types.js';
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
  competes_gi: number;
  competes_nogi: number;
  age_category_id: string | null;
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
    competesGi: !!row.competes_gi,
    competesNoGi: !!row.competes_nogi,
    ageCategoryId: row.age_category_id,
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
  format: string | null;
  bracket_section: string | null;
  loser_next_match_id: string | null;
  next_match_slot: number | null;
  loser_next_match_slot: number | null;
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
  if (row.format) match.format = row.format as Match['format'];
  if (row.bracket_section) match.bracketSection = row.bracket_section as Match['bracketSection'];
  if (row.loser_next_match_id) match.loserNextMatchId = row.loser_next_match_id;
  if (row.next_match_slot) match.nextMatchSlot = row.next_match_slot as 1 | 2;
  if (row.loser_next_match_slot) match.loserNextMatchSlot = row.loser_next_match_slot as 1 | 2;
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

interface WeightCategoryRow {
  id: string;
  age_group: AgeGroup;
  name: string;
  max_weight: number | null;
}

// English-only names — these are now organizer-editable plain text (like a
// team name), not an i18n lookup, so translations.ts no longer needs a
// weightClasses dictionary. Boundaries match the previously-hardcoded
// getWeightCategoryKey thresholds exactly, so a brand-new tournament groups
// competitors identically to the old global behavior until the organizer
// edits them.
const DEFAULT_WEIGHT_CATEGORIES: Array<{ ageGroup: AgeGroup; name: string; maxWeight: number | null }> = [
  { ageGroup: 'Adult', name: 'Rooster (-57.5 kg)', maxWeight: 57.5 },
  { ageGroup: 'Adult', name: 'Light Feather (-64.0 kg)', maxWeight: 64 },
  { ageGroup: 'Adult', name: 'Feather (-70.0 kg)', maxWeight: 70 },
  { ageGroup: 'Adult', name: 'Light (-76.0 kg)', maxWeight: 76 },
  { ageGroup: 'Adult', name: 'Middle (-82.3 kg)', maxWeight: 82.3 },
  { ageGroup: 'Adult', name: 'Medium Heavy (-88.3 kg)', maxWeight: 88.3 },
  { ageGroup: 'Adult', name: 'Heavy (-94.3 kg)', maxWeight: 94.3 },
  { ageGroup: 'Adult', name: 'Super Heavy (-100.5 kg)', maxWeight: 100.5 },
  { ageGroup: 'Adult', name: 'Ultra Heavy (100.5+ kg)', maxWeight: null },
  { ageGroup: 'Kid', name: 'Kids Tiny (-20 kg)', maxWeight: 20 },
  { ageGroup: 'Kid', name: 'Kids Small (-30 kg)', maxWeight: 30 },
  { ageGroup: 'Kid', name: 'Kids Medium (-45 kg)', maxWeight: 45 },
  { ageGroup: 'Kid', name: 'Kids Large (-60 kg)', maxWeight: 60 },
  { ageGroup: 'Kid', name: 'Kids Heavy (60+ kg)', maxWeight: null },
];

function rowToWeightCategory(row: WeightCategoryRow): WeightCategory {
  return { id: row.id, ageGroup: row.age_group, name: row.name, maxWeight: row.max_weight };
}

// Always re-sorted on read: ascending by maxWeight, null (no limit) last —
// order is never stored, so an edited boundary can never leave it stale.
export function getWeightCategoryRows(tournamentId: string): WeightCategory[] {
  const rows = getDb()
    .prepare(
      `SELECT id, age_group, name, max_weight FROM weight_categories WHERE tournament_id = ?
       ORDER BY age_group ASC, (max_weight IS NULL) ASC, max_weight ASC`
    )
    .all(tournamentId) as WeightCategoryRow[];
  return rows.map(rowToWeightCategory);
}

export function createDefaultWeightCategoryRows(tournamentId: string): void {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO weight_categories (id, tournament_id, age_group, name, max_weight) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const c of DEFAULT_WEIGHT_CATEGORIES) {
      insert.run(crypto.randomUUID(), tournamentId, c.ageGroup, c.name, c.maxWeight);
    }
  });
  tx();
}

// Full-replace used by PUT /api/weight-categories — ids are always
// regenerated, so the client never needs to reconcile old vs. new row ids.
export function replaceWeightCategoryRows(
  tournamentId: string,
  categories: Array<{ ageGroup: AgeGroup; name: string; maxWeight: number | null }>
): WeightCategory[] {
  const db = getDb();
  const del = db.prepare('DELETE FROM weight_categories WHERE tournament_id = ?');
  const insert = db.prepare(
    'INSERT INTO weight_categories (id, tournament_id, age_group, name, max_weight) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    del.run(tournamentId);
    for (const c of categories) {
      insert.run(crypto.randomUUID(), tournamentId, c.ageGroup, c.name.trim(), c.maxWeight);
    }
  });
  tx();
  return getWeightCategoryRows(tournamentId);
}

interface AgeCategoryRow {
  id: string;
  age_group: AgeGroup;
  name: string;
  sort_order: number;
}

// IBJJF-style defaults so a brand-new tournament already has sensible
// divisions instead of just the old binary Adult/Kid — organizer can edit
// or collapse down to fewer categories per group afterward.
const DEFAULT_AGE_CATEGORIES: Array<{ ageGroup: AgeGroup; name: string; sortOrder: number }> = [
  { ageGroup: 'Adult', name: 'Juvenile', sortOrder: 0 },
  { ageGroup: 'Adult', name: 'Adult', sortOrder: 1 },
  { ageGroup: 'Adult', name: 'Master 1', sortOrder: 2 },
  { ageGroup: 'Adult', name: 'Master 2', sortOrder: 3 },
  { ageGroup: 'Adult', name: 'Master 3', sortOrder: 4 },
  { ageGroup: 'Adult', name: 'Master 4', sortOrder: 5 },
  { ageGroup: 'Adult', name: 'Master 5', sortOrder: 6 },
  { ageGroup: 'Adult', name: 'Master 6', sortOrder: 7 },
  { ageGroup: 'Adult', name: 'Master 7', sortOrder: 8 },
  { ageGroup: 'Kid', name: 'Kids 1 (4-6)', sortOrder: 0 },
  { ageGroup: 'Kid', name: 'Kids 2 (7-9)', sortOrder: 1 },
  { ageGroup: 'Kid', name: 'Kids 3 (10-12)', sortOrder: 2 },
  { ageGroup: 'Kid', name: 'Kids 4 (13-15)', sortOrder: 3 },
];

function rowToAgeCategory(row: AgeCategoryRow): AgeCategory {
  return { id: row.id, ageGroup: row.age_group, name: row.name, sortOrder: row.sort_order };
}

export function getAgeCategoryRows(tournamentId: string): AgeCategory[] {
  const rows = getDb()
    .prepare(
      `SELECT id, age_group, name, sort_order FROM age_categories WHERE tournament_id = ?
       ORDER BY age_group ASC, sort_order ASC`
    )
    .all(tournamentId) as AgeCategoryRow[];
  return rows.map(rowToAgeCategory);
}

export function createDefaultAgeCategoryRows(tournamentId: string): void {
  const db = getDb();
  const insert = db.prepare(
    'INSERT INTO age_categories (id, tournament_id, age_group, name, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const c of DEFAULT_AGE_CATEGORIES) {
      insert.run(crypto.randomUUID(), tournamentId, c.ageGroup, c.name, c.sortOrder);
    }
  });
  tx();
}

// Full-replace used by PUT /api/age-categories — ids are always regenerated,
// same convention as replaceWeightCategoryRows.
export function replaceAgeCategoryRows(
  tournamentId: string,
  categories: Array<{ ageGroup: AgeGroup; name: string; sortOrder: number }>
): AgeCategory[] {
  const db = getDb();
  const del = db.prepare('DELETE FROM age_categories WHERE tournament_id = ?');
  const insert = db.prepare(
    'INSERT INTO age_categories (id, tournament_id, age_group, name, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    del.run(tournamentId);
    for (const c of categories) {
      insert.run(crypto.randomUUID(), tournamentId, c.ageGroup, c.name.trim(), c.sortOrder);
    }
  });
  tx();
  return getAgeCategoryRows(tournamentId);
}
