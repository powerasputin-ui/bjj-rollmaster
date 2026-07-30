import type { AgeGroup, BeltColor, Match, TimerConfig } from './types.js';

const BELT_COLORS: BeltColor[] = ['White', 'Blue', 'Purple', 'Brown', 'Black', 'Grey', 'Yellow', 'Orange', 'Green'];
const AGE_GROUPS: AgeGroup[] = ['Adult', 'Kid'];

export interface NewCompetitorInput {
  id: string;
  name: string;
  belt: BeltColor;
  weight: string;
  team: string;
  ageGroup: AgeGroup;
  isAbsolute?: boolean;
}

export function isValidNewCompetitor(c: unknown): c is NewCompetitorInput {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 && o.id.length <= 100 &&
    typeof o.name === 'string' && o.name.trim().length > 0 && o.name.length <= 200 &&
    typeof o.belt === 'string' && BELT_COLORS.includes(o.belt as BeltColor) &&
    typeof o.weight === 'string' && o.weight.length <= 20 && !isNaN(parseFloat(o.weight.replace(',', '.'))) &&
    typeof o.team === 'string' && o.team.length <= 200 &&
    typeof o.ageGroup === 'string' && AGE_GROUPS.includes(o.ageGroup as AgeGroup)
  );
}

export function isValidMatch(m: unknown): m is Match {
  if (!m || typeof m !== 'object') return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.id === 'string' && typeof o.bracketId === 'string' && typeof o.round === 'number' &&
    (o.status === 'pending' || o.status === 'ongoing' || o.status === 'finished')
  );
}

export function isValidTimerConfig(tc: unknown): tc is TimerConfig {
  if (!tc || typeof tc !== 'object') return false;
  const o = tc as Record<string, unknown>;
  return (
    typeof o.roundDuration === 'number' && o.roundDuration >= 1 && o.roundDuration <= 7200 &&
    typeof o.restDuration === 'number' && o.restDuration >= 0 && o.restDuration <= 600 &&
    typeof o.rounds === 'number' && o.rounds >= 1 && o.rounds <= 99
  );
}
