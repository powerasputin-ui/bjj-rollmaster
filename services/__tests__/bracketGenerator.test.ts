import { describe, it, expect } from 'vitest';
import {
  generateSingleEliminationMatches,
  generateRoundRobinMatches,
  generateDoubleEliminationMatches,
  seedAvoidingSameTeam,
  computeRoundRobinStandings,
  computeBracketPodium,
  isPowerOfTwo,
} from '../bracketGenerator';
import type { Competitor, Match } from '../../types';

const BYE_LABEL = 'Bye';

function makePool(n: number): Competitor[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `Athlete ${i}`,
    belt: 'White',
    weight: '70',
    team: 'T',
    ageGroup: 'Adult',
  }));
}

// One competitor per entry in `teams` (e.g. ['A','A','B','B','C','C','D','D']
// gives 4 teams of 2 — a pool where round-1 same-team collisions are
// entirely avoidable, used to prove the seeder actually avoids them).
function makeTeamPool(teams: string[]): Competitor[] {
  return teams.map((team, i) => ({
    id: `c${i}`,
    name: `Athlete ${i}`,
    belt: 'White',
    weight: '70',
    team,
    ageGroup: 'Adult',
  }));
}

function hasRoundOneSameTeamCollision(seeded: Competitor[]): boolean {
  const n = seeded.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    if (seeded[i].team === seeded[n - 1 - i].team) return true;
  }
  return false;
}

// Simulates the whole bracket to completion, picking a deterministic winner
// (always competitor1, if present, else competitor2) each time a match has
// both slots filled — used to assert end-to-end invariants like "everyone
// who is eliminated actually lost the required number of times."
function simulate(matches: Match[]): Match[] {
  let state = matches.map(m => ({ ...m }));
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const m of state) {
      if (m.status === 'pending' && m.competitor1Id && m.competitor2Id) {
        const winnerId = m.competitor1Id;
        applyResult(state, m.id, winnerId);
        progressed = true;
      }
    }
  }
  return state;
}

function applyResult(state: Match[], matchId: string, winnerId: string): void {
  const m = state.find(x => x.id === matchId);
  if (!m) return;
  m.winnerId = winnerId;
  m.status = 'finished';
  m.winMethod = 'Points';

  if (m.nextMatchId) {
    const next = state.find(x => x.id === m.nextMatchId);
    if (next) {
      const slot = m.nextMatchSlot ?? (parseInt(m.id.split('idx').pop() || '0', 10) % 2 === 0 ? 1 : 2);
      if (slot === 1) next.competitor1Id = winnerId; else next.competitor2Id = winnerId;
    }
  }
  if (m.loserNextMatchId && m.competitor1Id && m.competitor2Id) {
    const loserId = winnerId === m.competitor1Id ? m.competitor2Id : m.competitor1Id;
    const next = state.find(x => x.id === m.loserNextMatchId);
    if (next) {
      const slot = m.loserNextMatchSlot ?? 1;
      if (slot === 1) next.competitor1Id = loserId; else next.competitor2Id = loserId;
    }
  }
}

describe('isPowerOfTwo', () => {
  it('accepts 2, 4, 8, 16', () => {
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(4)).toBe(true);
    expect(isPowerOfTwo(8)).toBe(true);
    expect(isPowerOfTwo(16)).toBe(true);
  });
  it('rejects 1, 3, 5, 6, 7', () => {
    expect(isPowerOfTwo(1)).toBe(false);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(5)).toBe(false);
    expect(isPowerOfTwo(6)).toBe(false);
    expect(isPowerOfTwo(7)).toBe(false);
  });
});

describe('generateSingleEliminationMatches', () => {
  it('creates a full bracket with byes for a non-power-of-two pool (5 athletes)', () => {
    const matches = generateSingleEliminationMatches(makePool(5), 'cat1', '1', BYE_LABEL);
    // bracketSize=8 -> 4+2+1 = 7 matches total
    expect(matches).toHaveLength(7);
    const round1 = matches.filter(m => m.round === 1);
    expect(round1).toHaveLength(4);
    // 3 byes among round 1 (5 real players, 8 slots -> 3 byes)
    const byes = round1.filter(m => m.status === 'finished' && m.winMethod === BYE_LABEL);
    expect(byes).toHaveLength(3);
  });

  it('exactly one champion emerges when simulated to completion (8 athletes)', () => {
    const matches = generateSingleEliminationMatches(makePool(8), 'cat2', '1', BYE_LABEL);
    const final = simulate(matches);
    const finalMatch = final.find(m => !m.nextMatchId);
    expect(finalMatch?.status).toBe('finished');
    expect(finalMatch?.winnerId).toBeTruthy();
  });
});

describe('generateRoundRobinMatches', () => {
  it.each([3, 4, 5, 6, 7])('creates exactly n*(n-1)/2 matches with every pair meeting once (n=%i)', (n) => {
    const pool = makePool(n);
    const matches = generateRoundRobinMatches(pool, 'catrr', '1');
    expect(matches).toHaveLength((n * (n - 1)) / 2);

    const seenPairs = new Set<string>();
    for (const m of matches) {
      expect(m.competitor1Id).not.toBe(m.competitor2Id);
      const pairKey = [m.competitor1Id, m.competitor2Id].sort().join('|');
      expect(seenPairs.has(pairKey)).toBe(false);
      seenPairs.add(pairKey);
    }
    expect(seenPairs.size).toBe((n * (n - 1)) / 2);

    // No advancement fields are ever set for round robin.
    matches.forEach(m => {
      expect(m.nextMatchId).toBeUndefined();
      expect(m.loserNextMatchId ?? null).toBeNull();
    });
  });
});

describe('generateDoubleEliminationMatches', () => {
  it('throws for a non-power-of-two pool larger than 2', () => {
    expect(() => generateDoubleEliminationMatches(makePool(5), 'catde', '1', BYE_LABEL)).toThrow();
    expect(() => generateDoubleEliminationMatches(makePool(6), 'catde', '1', BYE_LABEL)).toThrow();
  });

  it('falls back to a single decisive match for a 2-player pool', () => {
    const matches = generateDoubleEliminationMatches(makePool(2), 'catde2', '1', BYE_LABEL);
    expect(matches).toHaveLength(1);
    expect(matches[0].bracketSection).toBe('final');
  });

  it('for n=4: 3 WB matches + 2 LB matches + 1 Grand Final = 6 total', () => {
    const matches = generateDoubleEliminationMatches(makePool(4), 'catde4', '1', BYE_LABEL);
    expect(matches).toHaveLength(6);
    expect(matches.filter(m => m.bracketSection === 'winners')).toHaveLength(3);
    expect(matches.filter(m => m.bracketSection === 'losers')).toHaveLength(2);
    expect(matches.filter(m => m.bracketSection === 'final')).toHaveLength(1);
  });

  it('for n=8: 7 WB matches + 6 LB matches + 1 Grand Final = 14 total', () => {
    const matches = generateDoubleEliminationMatches(makePool(8), 'catde8', '1', BYE_LABEL);
    expect(matches).toHaveLength(14);
    expect(matches.filter(m => m.bracketSection === 'winners')).toHaveLength(7);
    expect(matches.filter(m => m.bracketSection === 'losers')).toHaveLength(6);
    expect(matches.filter(m => m.bracketSection === 'final')).toHaveLength(1);
  });

  it('every winners-bracket match has a loserNextMatchId pointing at a real match (including the WB final, whose loser drops into the LB final)', () => {
    const matches = generateDoubleEliminationMatches(makePool(8), 'catde8b', '1', BYE_LABEL);
    const byId = new Map(matches.map(m => [m.id, m]));
    const wbMatches = matches.filter(m => m.bracketSection === 'winners');
    const maxWbRound = Math.max(...wbMatches.map(m => m.round));
    const wbFinal = wbMatches.find(m => m.round === maxWbRound);

    for (const m of wbMatches) {
      expect(m.loserNextMatchId).toBeTruthy();
      expect(byId.has(m.loserNextMatchId!)).toBe(true);
    }
    // The WB champion (winner of the WB final) goes on to the Grand Final.
    expect(wbFinal?.nextMatchId).toBeTruthy();
  });

  it('simulated to completion: exactly one champion, nobody plays after their second loss (n=8)', () => {
    const matches = generateDoubleEliminationMatches(makePool(8), 'catde8sim', '1', BYE_LABEL);
    const final = simulate(matches);

    const grandFinal = final.find(m => m.bracketSection === 'final');
    expect(grandFinal?.status).toBe('finished');
    expect(grandFinal?.winnerId).toBeTruthy();

    // Count losses per competitor across all real (non-bye) matches.
    const losses = new Map<string, number>();
    for (const m of final) {
      if (m.status === 'finished' && m.winnerId && m.competitor1Id && m.competitor2Id) {
        const loserId = m.winnerId === m.competitor1Id ? m.competitor2Id : m.competitor1Id;
        losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
      }
    }
    for (const count of losses.values()) {
      expect(count).toBeLessThanOrEqual(2);
    }

    // Every match that was ever created got played (no permanently-empty matches).
    for (const m of final) {
      expect(m.status).toBe('finished');
    }
  });

  it('simulated to completion: exactly one champion for n=4', () => {
    const matches = generateDoubleEliminationMatches(makePool(4), 'catde4sim', '1', BYE_LABEL);
    const final = simulate(matches);
    const grandFinal = final.find(m => m.bracketSection === 'final');
    expect(grandFinal?.status).toBe('finished');
    expect(grandFinal?.winnerId).toBeTruthy();
    for (const m of final) {
      expect(m.status).toBe('finished');
    }
  });
});

describe('seedAvoidingSameTeam', () => {
  it('returns a permutation of the input pool (same competitors, same length)', () => {
    const pool = makeTeamPool(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
    const seeded = seedAvoidingSameTeam(pool);
    expect(seeded).toHaveLength(pool.length);
    expect(new Set(seeded.map(c => c.id))).toEqual(new Set(pool.map(c => c.id)));
  });

  it('avoids every round-1 same-team pairing when it is possible to do so (4 teams of 2)', () => {
    for (let trial = 0; trial < 20; trial++) {
      const pool = makeTeamPool(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
      const seeded = seedAvoidingSameTeam(pool);
      expect(hasRoundOneSameTeamCollision(seeded)).toBe(false);
    }
  });

  it('does not crash and still returns every competitor when one team dominates the pool', () => {
    // 5 of 8 from the same team — some round-1 collision is mathematically
    // unavoidable, but the function must still terminate and return a full,
    // valid permutation rather than looping forever trying to fix the unfixable.
    const pool = makeTeamPool(['A', 'A', 'A', 'A', 'A', 'B', 'C', 'D']);
    const seeded = seedAvoidingSameTeam(pool);
    expect(seeded).toHaveLength(pool.length);
    expect(new Set(seeded.map(c => c.id))).toEqual(new Set(pool.map(c => c.id)));
  });

  it('generateSingleEliminationMatches round-1 matches never pair same-team competitors when avoidable', () => {
    for (let trial = 0; trial < 10; trial++) {
      const pool = makeTeamPool(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
      const matches = generateSingleEliminationMatches(pool, 'catseed', '1', BYE_LABEL);
      const round1 = matches.filter(m => m.round === 1);
      const byId = new Map(pool.map(c => [c.id, c.team]));
      round1.forEach(m => {
        if (m.competitor1Id && m.competitor2Id) {
          expect(byId.get(m.competitor1Id)).not.toBe(byId.get(m.competitor2Id));
        }
      });
    }
  });

  it('generateDoubleEliminationMatches WB round-1 matches never pair same-team competitors when avoidable', () => {
    for (let trial = 0; trial < 10; trial++) {
      const pool = makeTeamPool(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
      const matches = generateDoubleEliminationMatches(pool, 'catseedde', '1', BYE_LABEL);
      const wbRound1 = matches.filter(m => m.bracketSection === 'winners' && m.round === 1);
      const byId = new Map(pool.map(c => [c.id, c.team]));
      wbRound1.forEach(m => {
        if (m.competitor1Id && m.competitor2Id) {
          expect(byId.get(m.competitor1Id)).not.toBe(byId.get(m.competitor2Id));
        }
      });
    }
  });
});

function rrMatch(id: string, round: number, c1: string, c2: string, winnerId: string, score1: number, score2: number): Match {
  return {
    id,
    bracketId: 'catrr_tiebreak',
    round,
    format: 'round_robin',
    competitor1Id: c1,
    competitor2Id: c2,
    score1: { points: score1, advantages: 0, penalties: 0 },
    score2: { points: score2, advantages: 0, penalties: 0 },
    status: 'finished',
    winnerId,
  };
}

describe('computeRoundRobinStandings', () => {
  it('counts wins/losses and total points scored for/against each competitor', () => {
    const matches = [
      rrMatch('m1', 1, 'a', 'b', 'a', 10, 4),
      rrMatch('m2', 2, 'a', 'c', 'c', 2, 6),
      rrMatch('m3', 3, 'b', 'c', 'b', 8, 2),
    ];
    const standings = computeRoundRobinStandings(matches);
    const byId = new Map(standings.map(s => [s.id, s]));

    expect(byId.get('a')).toEqual({ id: 'a', wins: 1, losses: 1, pointsFor: 12, pointsAgainst: 10 });
    expect(byId.get('b')).toEqual({ id: 'b', wins: 1, losses: 1, pointsFor: 12, pointsAgainst: 12 });
    expect(byId.get('c')).toEqual({ id: 'c', wins: 1, losses: 1, pointsFor: 8, pointsAgainst: 10 });
  });

  it('breaks a three-way tie in wins by point differential', () => {
    // Everyone finishes 1-1, so pure win-count order would be arbitrary.
    // a: scored 10+2=12, allowed 4+10=14 -> diff -2
    // b: scored 4+8=12, allowed 10+2=12 -> diff 0
    // c: scored 10+2=12, allowed 2+8=10 -> diff +2
    const matches = [
      rrMatch('m1', 1, 'a', 'b', 'a', 10, 4),
      rrMatch('m2', 2, 'a', 'c', 'c', 2, 10),
      rrMatch('m3', 3, 'b', 'c', 'b', 8, 2),
    ];
    const standings = computeRoundRobinStandings(matches);
    expect(standings.map(s => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('ranks purely by point differential when all competitors have identical win counts', () => {
    const matches = [
      rrMatch('m1', 1, 'a', 'b', 'a', 20, 0),
      rrMatch('m2', 2, 'c', 'd', 'c', 5, 4),
    ];
    const standings = computeRoundRobinStandings(matches);
    // a: 1-0, diff +20. c: 1-0, diff +1. a must rank above c despite identical win counts.
    const aIdx = standings.findIndex(s => s.id === 'a');
    const cIdx = standings.findIndex(s => s.id === 'c');
    expect(aIdx).toBeLessThan(cIdx);
  });
});

describe('computeBracketPodium (round robin, via computeRoundRobinStandings)', () => {
  it('top-3 of the podium matches the top-3 of the full standings', () => {
    const matches = [
      rrMatch('m1', 1, 'a', 'b', 'a', 10, 4),
      rrMatch('m2', 2, 'a', 'c', 'a', 8, 2),
      rrMatch('m3', 3, 'b', 'c', 'c', 5, 3),
    ];
    const podium = computeBracketPodium(matches);
    const standings = computeRoundRobinStandings(matches);
    expect(podium?.goldId).toBe(standings[0].id);
    expect(podium?.silverId).toBe(standings[1].id);
    expect(podium?.bronzeIds).toEqual([standings[2].id]);
  });

  it('returns null while any match is still unfinished', () => {
    const matches = [
      rrMatch('m1', 1, 'a', 'b', 'a', 10, 4),
      { ...rrMatch('m2', 2, 'a', 'c', 'a', 8, 2), status: 'pending' as const, winnerId: undefined },
    ];
    expect(computeBracketPodium(matches)).toBeNull();
  });
});
