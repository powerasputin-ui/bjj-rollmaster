import { describe, it, expect } from 'vitest';
import { computeTournamentResults } from '../results';
import { translations } from '../../translations';
import type { Competitor, Match } from '../../types';

const t = translations.en;
const SCORE = { points: 0, advantages: 0, penalties: 0 };

function competitor(id: string, name: string, team: string): Competitor {
  return { id, name, belt: 'White', weight: '70', team, ageGroup: 'Adult' };
}

function match(overrides: Partial<Match> & Pick<Match, 'id' | 'bracketId' | 'round'>): Match {
  return {
    competitor1Id: null,
    competitor2Id: null,
    score1: SCORE,
    score2: SCORE,
    status: 'pending',
    ...overrides,
  };
}

describe('computeTournamentResults', () => {
  it('lists a concluded single-elimination category with gold/silver/bronze resolved to name+team', () => {
    const competitors = [
      competitor('a1', 'Athlete One', 'Team Alpha'),
      competitor('a2', 'Athlete Two', 'Team Bravo'),
      competitor('a3', 'Athlete Three', 'Team Charlie'),
      competitor('a4', 'Athlete Four', 'Team Delta'),
    ];
    const bracketId = 'gi_none_Adult_White_feather-uuid';
    const matches: Match[] = [
      match({ id: 'm1', bracketId, round: 1, competitor1Id: 'a1', competitor2Id: 'a2', status: 'finished', winnerId: 'a1' }),
      match({ id: 'm2', bracketId, round: 1, competitor1Id: 'a3', competitor2Id: 'a4', status: 'finished', winnerId: 'a3' }),
      match({ id: 'm3', bracketId, round: 2, competitor1Id: 'a1', competitor2Id: 'a3', status: 'finished', winnerId: 'a1' }),
    ];
    const weightCategories = [{ id: 'feather-uuid', ageGroup: 'Adult' as const, name: 'Feather (-70.0 kg)', maxWeight: 70 }];

    const results = computeTournamentResults(matches, competitors, weightCategories, t);
    expect(results).toHaveLength(1);
    const cat = results[0];
    expect(cat.concluded).toBe(true);
    expect(cat.label).toBe('Gi | White | Feather (-70.0 kg)');
    expect(cat.gold).toEqual({ id: 'a1', name: 'Athlete One', team: 'Team Alpha' });
    expect(cat.silver).toEqual({ id: 'a3', name: 'Athlete Three', team: 'Team Charlie' });
    // Single-elimination awards bronze to both semifinal losers.
    expect(cat.bronze).toEqual(expect.arrayContaining([
      { id: 'a2', name: 'Athlete Two', team: 'Team Bravo' },
      { id: 'a4', name: 'Athlete Four', team: 'Team Delta' },
    ]));
    expect(cat.bronze).toHaveLength(2);
  });

  it('marks a category with an unfinished deciding match as not concluded, without dropping it', () => {
    const competitors = [competitor('x1', 'X One', 'Team X'), competitor('x2', 'X Two', 'Team Y')];
    const bracketId = 'gi_none_Adult_Blue_light-uuid';
    const matches: Match[] = [
      match({ id: 'm1', bracketId, round: 1, competitor1Id: 'x1', competitor2Id: 'x2', status: 'ongoing' }),
    ];
    const weightCategories = [{ id: 'light-uuid', ageGroup: 'Adult' as const, name: 'Light (-76.0 kg)', maxWeight: 76 }];

    const results = computeTournamentResults(matches, competitors, weightCategories, t);
    expect(results).toHaveLength(1);
    expect(results[0].concluded).toBe(false);
    expect(results[0].gold).toBeUndefined();
  });

  it('labels the absolute/open-weight category using openWeightLabel instead of a weight category name', () => {
    const competitors = [competitor('o1', 'Open One', 'Team O'), competitor('o2', 'Open Two', 'Team P')];
    const bracketId = 'nogi_none_Adult_Black_absolute';
    const matches: Match[] = [
      match({ id: 'm1', bracketId, round: 1, competitor1Id: 'o1', competitor2Id: 'o2', status: 'finished', winnerId: 'o1' }),
    ];

    const results = computeTournamentResults(matches, competitors, [], t);
    expect(results[0].label).toBe(`${t.sparringFormatNoGi} | Black | ${t.openWeightLabel}`);
  });

  it('sorts categories alphabetically by label and handles multiple categories together', () => {
    const competitors = [
      competitor('a1', 'A', 'T'), competitor('a2', 'B', 'T'),
      competitor('b1', 'C', 'T'), competitor('b2', 'D', 'T'),
    ];
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'gi_none_Adult_White_zzz-uuid', round: 1, competitor1Id: 'a1', competitor2Id: 'a2', status: 'finished', winnerId: 'a1' }),
      match({ id: 'm2', bracketId: 'gi_none_Adult_White_aaa-uuid', round: 1, competitor1Id: 'b1', competitor2Id: 'b2', status: 'finished', winnerId: 'b1' }),
    ];
    const weightCategories = [
      { id: 'zzz-uuid', ageGroup: 'Adult' as const, name: 'Zulu (-100 kg)', maxWeight: 100 },
      { id: 'aaa-uuid', ageGroup: 'Adult' as const, name: 'Alpha (-60 kg)', maxWeight: 60 },
    ];

    const results = computeTournamentResults(matches, competitors, weightCategories, t);
    expect(results.map(r => r.label)).toEqual(['Gi | White | Alpha (-60 kg)', 'Gi | White | Zulu (-100 kg)']);
  });
});
