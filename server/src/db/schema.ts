// Kept as a TS string constant (not a loose .sql file) so it's always bundled
// by tsc into server/dist — a plain .sql asset would otherwise get silently
// left behind by the TypeScript build and break schema init in production.
//
// Multi-tenant, breaking change (pre-launch, no real deployed users yet): every
// tournament-owned table now requires tournament_id. There is no migration
// path from the old single-tenant schema — delete the dev DB file (DB_PATH)
// before running against this schema for the first time.
//
// One user can now own many tournaments (Smoothcomp-style: organizer account
// is separate from any one event) — tournaments reference their owner via
// owner_user_id instead of users referencing a single tournament_id.
export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  google_id TEXT UNIQUE,
  reset_token TEXT,
  reset_token_expires TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  event_date TEXT,
  location TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status_date ON tournaments(status, event_date);

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  name TEXT NOT NULL,
  belt TEXT NOT NULL,
  weight TEXT NOT NULL,
  team TEXT NOT NULL,
  age_group TEXT NOT NULL CHECK (age_group IN ('Adult','Kid')),
  is_absolute INTEGER NOT NULL DEFAULT 0,
  made_weight INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_competitors_tournament_status ON competitors(tournament_id, status);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  competitor1_id TEXT,
  competitor2_id TEXT,
  score1 TEXT NOT NULL DEFAULT '{"points":0,"advantages":0,"penalties":0}',
  score2 TEXT NOT NULL DEFAULT '{"points":0,"advantages":0,"penalties":0}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ongoing','finished')),
  winner_id TEXT,
  win_method TEXT,
  round INTEGER NOT NULL,
  bracket_id TEXT NOT NULL,
  next_match_id TEXT,
  mat TEXT,
  logs TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_matches_tournament_bracket ON matches(tournament_id, bracket_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_mat ON matches(tournament_id, mat);

-- One row per tournament (was a global singleton keyed id=1 pre-multi-tenancy).
CREATE TABLE IF NOT EXISTS timer_config (
  tournament_id TEXT PRIMARY KEY REFERENCES tournaments(id),
  round_duration INTEGER NOT NULL DEFAULT 300,
  rest_duration INTEGER NOT NULL DEFAULT 60,
  rounds INTEGER NOT NULL DEFAULT 1
);
`;
