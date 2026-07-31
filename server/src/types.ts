export type BeltColor = 'White' | 'Blue' | 'Purple' | 'Brown' | 'Black' | 'Grey' | 'Yellow' | 'Orange' | 'Green';
export type AgeGroup = 'Adult' | 'Kid';
export type CompetitorStatus = 'approved' | 'pending' | 'rejected';

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
  status?: CompetitorStatus;
}

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

export interface WeightCategory {
  id: string;
  ageGroup: AgeGroup;
  name: string;
  maxWeight: number | null;
}

export interface AgeCategory {
  id: string;
  ageGroup: AgeGroup;
  name: string;
  sortOrder: number;
}

// Ephemeral per-mat live scoreboard state, relayed over WebSocket while a match
// is in progress. Never persisted — final results go through /matches/:id/finish.
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
