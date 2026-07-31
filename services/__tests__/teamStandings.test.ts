import { describe, it, expect } from 'vitest';
import { computeTeamStandings, GOLD_POINTS, SILVER_POINTS, BRONZE_POINTS } from '../teamStandings';
import type { Competitor, Match } from '../../types';

const SCORE = { points: 0, advantages: 0, penalties: 0 };

function competitor(id: string, team: string): Competitor {
  return { id, name: id, belt: 'White', weight: '70', team, ageGroup: 'Adult' };
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

describe('computeTeamStandings', () => {
  it('tallies gold/silver/bronze and points for a concluded single-elimination category', () => {
    const competitors = [
      competitor('a1', 'Team Alpha'),
      competitor('a2', 'Team Bravo'),
      competitor('a3', 'Team Charlie'),
      competitor('a4', 'Team Delta'),
    ];
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'cat1', round: 1, competitor1Id: 'a1', competitor2Id: 'a2', status: 'finished', winnerId: 'a1' }),
      match({ id: 'm2', bracketId: 'cat1', round: 1, competitor1Id: 'a3', competitor2Id: 'a4', status: 'finished', winnerId: 'a3' }),
      match({ id: 'm3', bracketId: 'cat1', round: 2, competitor1Id: 'a1', competitor2Id: 'a3', status: 'finished', winnerId: 'a1' }),
    ];

    const standings = computeTeamStandings(matches, competitors);
    const byTeam = new Map(standings.map(s => [s.team, s]));

    expect(byTeam.get('Team Alpha')).toEqual({ team: 'Team Alpha', gold: 1, silver: 0, bronze: 0, points: GOLD_POINTS });
    expect(byTeam.get('Team Charlie')).toEqual({ team: 'Team Charlie', gold: 0, silver: 1, bronze: 0, points: SILVER_POINTS });
    expect(byTeam.get('Team Bravo')).toEqual({ team: 'Team Bravo', gold: 0, silver: 0, bronze: 1, points: BRONZE_POINTS });
    expect(byTeam.get('Team Delta')).toEqual({ team: 'Team Delta', gold: 0, silver: 0, bronze: 1, points: BRONZE_POINTS });
  });

  it('credits round-robin standings using win count, and accumulates points for a team across multiple categories', () => {
    const competitors = [
      competitor('a1', 'Team Alpha'),
      competitor('a2', 'Team Bravo'),
      competitor('a3', 'Team Charlie'),
      competitor('a4', 'Team Delta'),
      competitor('b1', 'Team Alpha'),
      competitor('b2', 'Team Echo'),
      competitor('b3', 'Team Foxtrot'),
    ];
    const singleElimMatches: Match[] = [
      match({ id: 'm1', bracketId: 'cat1', round: 1, competitor1Id: 'a1', competitor2Id: 'a2', status: 'finished', winnerId: 'a1' }),
      match({ id: 'm2', bracketId: 'cat1', round: 1, competitor1Id: 'a3', competitor2Id: 'a4', status: 'finished', winnerId: 'a3' }),
      match({ id: 'm3', bracketId: 'cat1', round: 2, competitor1Id: 'a1', competitor2Id: 'a3', status: 'finished', winnerId: 'a1' }),
    ];
    const roundRobinMatches: Match[] = [
      match({ id: 'm4', bracketId: 'cat2', round: 1, format: 'round_robin', competitor1Id: 'b1', competitor2Id: 'b2', status: 'finished', winnerId: 'b1' }),
      match({ id: 'm5', bracketId: 'cat2', round: 2, format: 'round_robin', competitor1Id: 'b1', competitor2Id: 'b3', status: 'finished', winnerId: 'b1' }),
      match({ id: 'm6', bracketId: 'cat2', round: 3, format: 'round_robin', competitor1Id: 'b2', competitor2Id: 'b3', status: 'finished', winnerId: 'b2' }),
    ];

    const standings = computeTeamStandings([...singleElimMatches, ...roundRobinMatches], competitors);
    const byTeam = new Map(standings.map(s => [s.team, s]));

    // Team Alpha wins gold in both categories (a1 in cat1, b1 in cat2).
    expect(byTeam.get('Team Alpha')).toEqual({ team: 'Team Alpha', gold: 2, silver: 0, bronze: 0, points: 2 * GOLD_POINTS });
    expect(byTeam.get('Team Echo')).toEqual({ team: 'Team Echo', gold: 0, silver: 1, bronze: 0, points: SILVER_POINTS });
    expect(byTeam.get('Team Foxtrot')).toEqual({ team: 'Team Foxtrot', gold: 0, silver: 0, bronze: 1, points: BRONZE_POINTS });

    // Sorted by total points descending, so the double-gold team leads.
    expect(standings[0].team).toBe('Team Alpha');
  });

  it('ignores a category whose deciding match has not finished yet', () => {
    const competitors = [competitor('x1', 'Team Unfinished'), competitor('x2', 'Team AlsoUnfinished')];
    const matches: Match[] = [
      match({ id: 'm1', bracketId: 'cat3', round: 1, competitor1Id: 'x1', competitor2Id: 'x2', status: 'ongoing' }),
    ];

    const standings = computeTeamStandings(matches, competitors);
    expect(standings.find(s => s.team === 'Team Unfinished')).toBeUndefined();
    expect(standings.find(s => s.team === 'Team AlsoUnfinished')).toBeUndefined();
  });

  it('gives a single bronze (not two) for a double-elimination category', () => {
    // Mirrors the n=4 shape produced by generateDoubleEliminationMatches:
    // 2 WB round-1 matches -> WB final -> Grand Final, and the WB round-1
    // losers feed a losers-bracket round that in turn feeds an LB final.
    const competitors = [
      competitor('d1', 'Team Gold'),
      competitor('d2', 'Team Bronze'),
      competitor('d3', 'Team Silver'),
      competitor('d4', 'Team NoMedal'),
    ];
    const matches: Match[] = [
      match({ id: 'wb_r1_idx0', bracketId: 'catde', round: 1, format: 'double', bracketSection: 'winners', competitor1Id: 'd1', competitor2Id: 'd4', status: 'finished', winnerId: 'd1', loserNextMatchId: 'lb_r1_idx0', loserNextMatchSlot: 1 }),
      match({ id: 'wb_r1_idx1', bracketId: 'catde', round: 1, format: 'double', bracketSection: 'winners', competitor1Id: 'd2', competitor2Id: 'd3', status: 'finished', winnerId: 'd2', loserNextMatchId: 'lb_r1_idx0', loserNextMatchSlot: 2 }),
      match({ id: 'wb_r2', bracketId: 'catde', round: 2, format: 'double', bracketSection: 'winners', competitor1Id: 'd1', competitor2Id: 'd2', status: 'finished', winnerId: 'd1', loserNextMatchId: 'lb_r2', loserNextMatchSlot: 2 }),
      match({ id: 'lb_r1_idx0', bracketId: 'catde', round: 1, format: 'double', bracketSection: 'losers', competitor1Id: 'd4', competitor2Id: 'd3', status: 'finished', winnerId: 'd3' }),
      match({ id: 'lb_r2', bracketId: 'catde', round: 2, format: 'double', bracketSection: 'losers', competitor1Id: 'd3', competitor2Id: 'd2', status: 'finished', winnerId: 'd3' }),
      match({ id: 'gf', bracketId: 'catde', round: 1, format: 'double', bracketSection: 'final', competitor1Id: 'd1', competitor2Id: 'd3', status: 'finished', winnerId: 'd1' }),
    ];

    const standings = computeTeamStandings(matches, competitors);
    expect(standings.find(s => s.team === 'Team Gold')).toEqual({ team: 'Team Gold', gold: 1, silver: 0, bronze: 0, points: GOLD_POINTS });
    expect(standings.find(s => s.team === 'Team Silver')).toEqual({ team: 'Team Silver', gold: 0, silver: 1, bronze: 0, points: SILVER_POINTS });
    expect(standings.find(s => s.team === 'Team Bronze')).toEqual({ team: 'Team Bronze', gold: 0, silver: 0, bronze: 1, points: BRONZE_POINTS });
    expect(standings.find(s => s.team === 'Team NoMedal')).toBeUndefined();
  });
});
