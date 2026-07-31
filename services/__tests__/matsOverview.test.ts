import { describe, it, expect } from 'vitest';
import { computeMatsOverview } from '../matsOverview';
import type { Match } from '../../types';

const SCORE = { points: 0, advantages: 0, penalties: 0 };

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

describe('computeMatsOverview', () => {
  it('picks the ongoing match on a mat as current, and the first fully-paired pending match as next', () => {
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'cat1', round: 1, mat: '1', status: 'ongoing', competitor1Id: 'a', competitor2Id: 'b' }),
      match({ id: 'm2', bracketId: 'cat1', round: 2, mat: '1', status: 'pending', competitor1Id: null, competitor2Id: null }),
      match({ id: 'm3', bracketId: 'cat2', round: 1, mat: '1', status: 'pending', competitor1Id: 'c', competitor2Id: 'd' }),
    ];
    const overview = computeMatsOverview(matches, ['1']);
    expect(overview).toHaveLength(1);
    expect(overview[0].current?.id).toBe('m1');
    expect(overview[0].next?.id).toBe('m3');
  });

  it('returns null for current/next when a mat has nothing assigned', () => {
    const overview = computeMatsOverview([], ['1', '2']);
    expect(overview).toEqual([
      { mat: '1', current: null, next: null },
      { mat: '2', current: null, next: null },
    ]);
  });

  it('does not treat a pending match with an empty slot (not yet fed by an earlier round) as next', () => {
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'cat1', round: 2, mat: '2', status: 'pending', competitor1Id: 'a', competitor2Id: null }),
    ];
    const overview = computeMatsOverview(matches, ['2']);
    expect(overview[0].next).toBeNull();
  });

  it('only considers matches assigned to the mat in question', () => {
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'cat1', round: 1, mat: '1', status: 'ongoing', competitor1Id: 'a', competitor2Id: 'b' }),
      match({ id: 'm2', bracketId: 'cat1', round: 1, mat: '2', status: 'pending', competitor1Id: 'c', competitor2Id: 'd' }),
    ];
    const overview = computeMatsOverview(matches, ['1', '2']);
    expect(overview.find(e => e.mat === '1')?.current?.id).toBe('m1');
    expect(overview.find(e => e.mat === '1')?.next).toBeNull();
    expect(overview.find(e => e.mat === '2')?.current).toBeNull();
    expect(overview.find(e => e.mat === '2')?.next?.id).toBe('m2');
  });
});
