import type { AgeGroup, BeltColor, Match, TimerConfig } from './types.js';

const BELT_COLORS: BeltColor[] = ['White', 'Blue', 'Purple', 'Brown', 'Black', 'Grey', 'Yellow', 'Orange', 'Green'];
const AGE_GROUPS: AgeGroup[] = ['Adult', 'Kid'];

export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidBelt(belt: unknown): belt is BeltColor {
  return typeof belt === 'string' && BELT_COLORS.includes(belt as BeltColor);
}

export function isValidAgeGroup(ageGroup: unknown): ageGroup is AgeGroup {
  return typeof ageGroup === 'string' && AGE_GROUPS.includes(ageGroup as AgeGroup);
}

export interface NewCompetitorInput {
  id: string;
  name: string;
  belt: BeltColor;
  weight: string;
  team: string;
  ageGroup: AgeGroup;
  isAbsolute?: boolean;
  competesGi?: boolean;
  competesNoGi?: boolean;
  ageCategoryId?: string | null;
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

export interface WeightCategoryInput {
  ageGroup: AgeGroup;
  name: string;
  maxWeight: number | null;
}

function isValidWeightCategoryItem(c: unknown): c is WeightCategoryInput {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (typeof o.ageGroup !== 'string' || !AGE_GROUPS.includes(o.ageGroup as AgeGroup)) return false;
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 60) return false;
  if (o.maxWeight !== null && (typeof o.maxWeight !== 'number' || !isFinite(o.maxWeight) || o.maxWeight <= 0 || o.maxWeight > 500)) return false;
  return true;
}

// Full-replace payload for PUT /api/weight-categories. Requires exactly one
// "no limit" (maxWeight: null) category per age group — without one, an
// athlete heavier than every configured boundary would silently fall into
// an uncategorized bucket with no bracket, which is worse than rejecting the
// save outright.
export function isValidWeightCategoriesReplace(body: unknown): body is WeightCategoryInput[] {
  if (!Array.isArray(body) || body.length === 0 || body.length > 40) return false;
  if (!body.every(isValidWeightCategoryItem)) return false;

  const items = body as WeightCategoryInput[];
  for (const ageGroup of AGE_GROUPS) {
    const forAge = items.filter(c => c.ageGroup === ageGroup);
    if (forAge.length === 0) return false;
    if (forAge.filter(c => c.maxWeight === null).length !== 1) return false;

    const bounds = forAge.filter(c => c.maxWeight !== null).map(c => c.maxWeight);
    if (new Set(bounds).size !== bounds.length) return false;
  }

  return true;
}

export interface AgeCategoryInput {
  ageGroup: AgeGroup;
  name: string;
  sortOrder: number;
}

function isValidAgeCategoryItem(c: unknown): c is AgeCategoryInput {
  if (!c || typeof c !== 'object') return false;
  const o = c as Record<string, unknown>;
  if (typeof o.ageGroup !== 'string' || !AGE_GROUPS.includes(o.ageGroup as AgeGroup)) return false;
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 60) return false;
  if (typeof o.sortOrder !== 'number' || !isFinite(o.sortOrder)) return false;
  return true;
}

// Full-replace payload for PUT /api/age-categories. Unlike weight categories,
// there's no numeric boundary concept, so the only requirement is at least
// one category per age group (no "no limit" slot to enforce).
export function isValidAgeCategoriesReplace(body: unknown): body is AgeCategoryInput[] {
  if (!Array.isArray(body) || body.length === 0 || body.length > 40) return false;
  if (!body.every(isValidAgeCategoryItem)) return false;

  const items = body as AgeCategoryInput[];
  for (const ageGroup of AGE_GROUPS) {
    if (items.filter(c => c.ageGroup === ageGroup).length === 0) return false;
  }

  return true;
}
