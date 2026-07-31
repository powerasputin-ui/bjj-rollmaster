import { describe, it, expect } from 'vitest';
import {
  getWeightCategoryKey,
  orderedCategoryIds,
  BELT_RANK,
  type Competitor,
  type Match,
  type TimerConfig,
  type WeightCategory,
} from './types';

// Mirrors the old hardcoded boundaries (server/src/db/client.ts's
// DEFAULT_WEIGHT_CATEGORIES), just as a local WeightCategory[] fixture with
// stable test ids, now that categories are per-tournament data rather than a
// global constant.
const rooster: WeightCategory = { id: 'adult-rooster', ageGroup: 'Adult', name: 'Rooster', maxWeight: 57.5 };
const lightFeather: WeightCategory = { id: 'adult-light-feather', ageGroup: 'Adult', name: 'Light Feather', maxWeight: 64 };
const ultraHeavy: WeightCategory = { id: 'adult-ultra-heavy', ageGroup: 'Adult', name: 'Ultra Heavy', maxWeight: null };
const kidTiny: WeightCategory = { id: 'kid-tiny', ageGroup: 'Kid', name: 'Kids Tiny', maxWeight: 20 };
const kidSmall: WeightCategory = { id: 'kid-small', ageGroup: 'Kid', name: 'Kids Small', maxWeight: 30 };
const kidMedium: WeightCategory = { id: 'kid-medium', ageGroup: 'Kid', name: 'Kids Medium', maxWeight: 45 };
const kidLarge: WeightCategory = { id: 'kid-large', ageGroup: 'Kid', name: 'Kids Large', maxWeight: 60 };

const fixtureCategories: WeightCategory[] = [rooster, lightFeather, ultraHeavy, kidTiny, kidSmall, kidMedium, kidLarge];

describe('getWeightCategoryKey', () => {
  it('returns rooster for adult <= 57.5 kg', () => {
    expect(getWeightCategoryKey('57.5', 'Adult', fixtureCategories)).toBe(rooster.id);
    expect(getWeightCategoryKey('50', 'Adult', fixtureCategories)).toBe(rooster.id);
  });

  it('returns lightFeather for adult 57.5-64 kg', () => {
    expect(getWeightCategoryKey('64', 'Adult', fixtureCategories)).toBe(lightFeather.id);
    expect(getWeightCategoryKey('60', 'Adult', fixtureCategories)).toBe(lightFeather.id);
  });

  it('returns the null-maxWeight (no limit) category for adult > every configured boundary', () => {
    expect(getWeightCategoryKey('110', 'Adult', fixtureCategories)).toBe(ultraHeavy.id);
  });

  it('returns unknown for invalid weight', () => {
    expect(getWeightCategoryKey('', 'Adult', fixtureCategories)).toBe('unknown');
    expect(getWeightCategoryKey('abc', 'Adult', fixtureCategories)).toBe('unknown');
  });

  it('returns kid categories for Kid age group', () => {
    expect(getWeightCategoryKey('15', 'Kid', fixtureCategories)).toBe(kidTiny.id);
    expect(getWeightCategoryKey('25', 'Kid', fixtureCategories)).toBe(kidSmall.id);
    expect(getWeightCategoryKey('40', 'Kid', fixtureCategories)).toBe(kidMedium.id);
    expect(getWeightCategoryKey('50', 'Kid', fixtureCategories)).toBe(kidLarge.id);
  });

  it('falls back to unknown when the age group has no open-ended (no limit) category configured', () => {
    const noOpenCategory: WeightCategory[] = [{ id: 'kid-only-bounded', ageGroup: 'Kid', name: 'Only Bounded', maxWeight: 30 }];
    expect(getWeightCategoryKey('999', 'Kid', noOpenCategory)).toBe('unknown');
  });

  it('returns unknown when no categories are configured for the age group at all', () => {
    expect(getWeightCategoryKey('70', 'Adult', [])).toBe('unknown');
  });
});

describe('orderedCategoryIds', () => {
  it('sorts ascending by maxWeight with the null (no limit) category last', () => {
    expect(orderedCategoryIds(fixtureCategories, 'Adult')).toEqual([rooster.id, lightFeather.id, ultraHeavy.id]);
    expect(orderedCategoryIds(fixtureCategories, 'Kid')).toEqual([kidTiny.id, kidSmall.id, kidMedium.id, kidLarge.id]);
  });
});

describe('BELT_RANK', () => {
  it('ranks Black highest and White lowest for adults', () => {
    expect(BELT_RANK['Black']).toBeGreaterThan(BELT_RANK['White']);
    expect(BELT_RANK['Brown']).toBeGreaterThan(BELT_RANK['Blue']);
  });
});

describe('type guards / schema', () => {
  const validCompetitor: Competitor = {
    id: '1',
    name: 'Test',
    belt: 'Blue',
    weight: '70',
    team: 'Academy',
    ageGroup: 'Adult',
  };

  it('Competitor shape', () => {
    expect(validCompetitor.id).toBe('1');
    expect(validCompetitor.ageGroup).toBe('Adult');
  });

  const validMatch: Match = {
    id: 'm1',
    competitor1Id: null,
    competitor2Id: null,
    score1: { points: 0, advantages: 0, penalties: 0 },
    score2: { points: 0, advantages: 0, penalties: 0 },
    status: 'pending',
    round: 1,
    bracketId: 'cat1',
  };

  it('Match shape', () => {
    expect(validMatch.status).toBe('pending');
    expect(validMatch.round).toBe(1);
  });

  const validTimerConfig: TimerConfig = {
    roundDuration: 300,
    restDuration: 60,
    rounds: 1,
  };

  it('TimerConfig shape', () => {
    expect(validTimerConfig.roundDuration).toBe(300);
    expect(validTimerConfig.rounds).toBe(1);
  });
});
