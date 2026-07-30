import { describe, it, expect } from 'vitest';
import {
  getWeightCategoryKey,
  WEIGHT_ORDER,
  BELT_RANK,
  type Competitor,
  type Match,
  type TimerConfig,
} from './types';

describe('getWeightCategoryKey', () => {
  it('returns rooster for adult <= 57.5 kg', () => {
    expect(getWeightCategoryKey('57.5', 'Adult')).toBe('rooster');
    expect(getWeightCategoryKey('50', 'Adult')).toBe('rooster');
  });

  it('returns lightFeather for adult 57.5-64 kg', () => {
    expect(getWeightCategoryKey('64', 'Adult')).toBe('lightFeather');
    expect(getWeightCategoryKey('60', 'Adult')).toBe('lightFeather');
  });

  it('returns ultraHeavy for adult > 100.5 kg', () => {
    expect(getWeightCategoryKey('110', 'Adult')).toBe('ultraHeavy');
  });

  it('returns unknown for invalid weight', () => {
    expect(getWeightCategoryKey('', 'Adult')).toBe('unknown');
    expect(getWeightCategoryKey('abc', 'Adult')).toBe('unknown');
  });

  it('returns kid categories for Kid age group', () => {
    expect(getWeightCategoryKey('15', 'Kid')).toBe('kidTiny');
    expect(getWeightCategoryKey('25', 'Kid')).toBe('kidSmall');
    expect(getWeightCategoryKey('40', 'Kid')).toBe('kidMedium');
    expect(getWeightCategoryKey('50', 'Kid')).toBe('kidLarge');
  });
});

describe('WEIGHT_ORDER', () => {
  it('has expected adult weight keys', () => {
    expect(WEIGHT_ORDER['rooster']).toBe(1);
    expect(WEIGHT_ORDER['ultraHeavy']).toBe(9);
    expect(WEIGHT_ORDER['absolute']).toBe(100);
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
