
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
  status?: 'approved' | 'pending' | 'rejected';
}

export interface Score {
  points: number;
  advantages: number;
  penalties: number;
}

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
  SETTINGS = 'SETTINGS'
}

export const WEIGHT_ORDER: Record<string, number> = {
  'rooster': 1, 'lightFeather': 2, 'feather': 3, 'light': 4, 'middle': 5, 
  'mediumHeavy': 6, 'heavy': 7, 'superHeavy': 8, 'ultraHeavy': 9,
  'kidTiny': 1, 'kidSmall': 2, 'kidMedium': 3, 'kidLarge': 4, 'kidHuge': 5,
  'absolute': 100, 'unknown': 999
};

export const getWeightCategoryKey = (weightStr: string, ageGroup: AgeGroup): string => {
  const weight = parseFloat(weightStr.toString().replace(',', '.').replace(/[^\d.]/g, ''));
  if (isNaN(weight)) return 'unknown';
  
  if (ageGroup === 'Adult') {
    if (weight <= 57.5) return 'rooster';
    if (weight <= 64) return 'lightFeather';
    if (weight <= 70) return 'feather';
    if (weight <= 76) return 'light';
    if (weight <= 82.3) return 'middle';
    if (weight <= 88.3) return 'mediumHeavy';
    if (weight <= 94.3) return 'heavy';
    if (weight <= 100.5) return 'superHeavy';
    return 'ultraHeavy';
  } else {
    if (weight <= 20) return 'kidTiny';
    if (weight <= 30) return 'kidSmall';
    if (weight <= 45) return 'kidMedium';
    if (weight <= 60) return 'kidLarge';
    return 'kidHuge';
  }
};

export const BELT_RANK: Record<string, number> = {
  'Black': 10, 'Brown': 9, 'Purple': 8, 'Blue': 7, 'White': 1,
  'Green': 6, 'Orange': 5, 'Yellow': 4, 'Grey': 3
};
