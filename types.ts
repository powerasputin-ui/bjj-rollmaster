
export type BeltColor = 'White' | 'Blue' | 'Purple' | 'Brown' | 'Black' | 'Grey' | 'Yellow' | 'Orange' | 'Green';
export type AgeGroup = 'Adult' | 'Kid';

export interface MatchEvent {
  time: string;
  action: string;
  points: number;
  player: 1 | 2;
}

export interface Competitor {
  id: string;
  name: string;
  belt: BeltColor;
  weight: string;
  team: string;
  ageGroup: AgeGroup;
  isAbsolute?: boolean;
  madeWeight?: boolean;
  competesGi?: boolean;
  competesNoGi?: boolean;
  ageCategoryId?: string | null;
  status?: 'approved' | 'pending' | 'rejected';
}

export type SparringFormat = 'gi' | 'nogi' | 'both';

export interface Score {
  points: number;
  advantages: number;
  penalties: number;
}

export type BracketFormat = 'single' | 'double' | 'round_robin';

export interface Match {
  id: string;
  competitor1Id: string | null;
  competitor2Id: string | null;
  score1: Score;
  score2: Score;
  status: 'pending' | 'ongoing' | 'finished';
  winnerId?: string;
  winMethod?: string;
  round: number;
  bracketId: string;
  nextMatchId?: string;
  mat?: string;
  logs?: MatchEvent[];
  // Bracket-format metadata, denormalized onto every match sharing a
  // bracketId (same pattern as bracketId/mat themselves). Only 'double'
  // uses bracketSection/loserNextMatch*; single-elim matches never set
  // these, so the existing id-parity-based slot inference stays the
  // legacy fallback for them (see BracketView.tsx / matches.ts finish).
  format?: BracketFormat;
  bracketSection?: 'winners' | 'losers' | 'final';
  loserNextMatchId?: string | null;
  nextMatchSlot?: 1 | 2;
  loserNextMatchSlot?: 1 | 2;
}

export interface TimerConfig {
  roundDuration: number;
  restDuration: number;
  rounds: number;
}

// Ephemeral per-mat live scoreboard state relayed over WebSocket while a match
// is in progress (see services/matSocket.ts). Never persisted client-side.
export interface LiveState {
  timeLeft: number;
  isActive: boolean;
  isResting: boolean;
  currentRound: number;
  score1: Score;
  score2: Score;
  medTime: number | null;
  matchLog: MatchEvent[];
  config: TimerConfig;
}

export enum View {
  DASHBOARD = 'DASHBOARD',
  TIMER = 'TIMER',
  TOURNAMENT = 'TOURNAMENT',
  BRACKETS = 'BRACKETS',
  PENDING = 'PENDING',
  TEAMS = 'TEAMS',
  RESULTS = 'RESULTS',
  MATS = 'MATS',
  SETTINGS = 'SETTINGS'
}

export interface WeightCategory {
  id: string;
  ageGroup: AgeGroup;
  name: string;
  maxWeight: number | null;
}

// Ascending by maxWeight, null (no upper bound — the heaviest category)
// last. Order is never stored server-side, so this is the single source of
// truth for display/sort order everywhere categories are rendered.
function sortCategories(categories: WeightCategory[], ageGroup: AgeGroup): WeightCategory[] {
  return categories
    .filter(c => c.ageGroup === ageGroup)
    .sort((a, b) => {
      if (a.maxWeight === null) return 1;
      if (b.maxWeight === null) return -1;
      return a.maxWeight - b.maxWeight;
    });
}

export function orderedCategoryIds(categories: WeightCategory[], ageGroup: AgeGroup): string[] {
  return sortCategories(categories, ageGroup).map(c => c.id);
}

// `categories` is required (no hardcoded-default fallback) — defaulting to
// the old global boundaries would silently mis-group competitors the moment
// a tournament's real configured categories diverge from them. An empty
// list (e.g. before the per-tournament fetch resolves) safely resolves every
// competitor to 'unknown' for that render, same as competitors/matches
// starting as [] elsewhere in the app.
export const getWeightCategoryKey = (weightStr: string, ageGroup: AgeGroup, categories: WeightCategory[]): string => {
  const weight = parseFloat(weightStr.toString().replace(',', '.').replace(/[^\d.]/g, ''));
  if (isNaN(weight)) return 'unknown';
  const match = sortCategories(categories, ageGroup).find(c => c.maxWeight === null || weight <= c.maxWeight);
  return match ? match.id : 'unknown';
};

// A second, independent refinement axis within each ageGroup (Juvenile,
// Adult, Master 1-7, or a handful of kids sub-brackets) — organizer-
// configurable like WeightCategory, but there's no numeric value to
// auto-bucket a competitor into one (unlike weight), so it's a direct pick
// (like belt) rather than computed. ageGroup itself is unchanged and still
// drives belt-list eligibility and which weight_categories apply — Masters
// share the adult weight classes in real BJJ rules, so that axis is
// deliberately not subdivided further here.
export interface AgeCategory {
  id: string;
  ageGroup: AgeGroup;
  name: string;
  sortOrder: number;
}

export function orderedAgeCategoryIds(categories: AgeCategory[], ageGroup: AgeGroup): string[] {
  return categories
    .filter(c => c.ageGroup === ageGroup)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(c => c.id);
}

export const BELT_RANK: Record<string, number> = {
  'Black': 10, 'Brown': 9, 'Purple': 8, 'Blue': 7, 'White': 1,
  'Green': 6, 'Orange': 5, 'Yellow': 4, 'Grey': 3
};
