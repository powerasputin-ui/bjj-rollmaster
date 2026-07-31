import type { Competitor, Match } from '../types';
import { computeBracketPodium } from './bracketGenerator';

// IBJJF-style team scoring: gold outweighs silver+bronze combined, so a team
// can't out-medal a rival team purely on volume of thirds.
export const GOLD_POINTS = 9;
export const SILVER_POINTS = 3;
export const BRONZE_POINTS = 1;

export interface TeamStanding {
  team: string;
  gold: number;
  silver: number;
  bronze: number;
  points: number;
}

// Tallies medals per team across every concluded category (bracketId group)
// in the given matches, crediting whichever team the medal-winning competitor
// belongs to. Categories that haven't concluded yet (no podium computable)
// simply contribute nothing — the table fills in progressively as the
// tournament plays out, same as BracketView's per-category podium.
export function computeTeamStandings(matches: Match[], competitors: Competitor[]): TeamStanding[] {
  const teamById = new Map<string, string>();
  competitors.forEach(c => teamById.set(c.id, c.team));

  const byBracket = new Map<string, Match[]>();
  matches.forEach(m => {
    const list = byBracket.get(m.bracketId);
    if (list) list.push(m);
    else byBracket.set(m.bracketId, [m]);
  });

  const tally = new Map<string, TeamStanding>();
  const credit = (competitorId: string | undefined | null, medal: 'gold' | 'silver' | 'bronze') => {
    if (!competitorId) return;
    const team = teamById.get(competitorId);
    if (!team) return;
    let entry = tally.get(team);
    if (!entry) {
      entry = { team, gold: 0, silver: 0, bronze: 0, points: 0 };
      tally.set(team, entry);
    }
    entry[medal] += 1;
    entry.points += medal === 'gold' ? GOLD_POINTS : medal === 'silver' ? SILVER_POINTS : BRONZE_POINTS;
  };

  byBracket.forEach(bracketMatches => {
    const podium = computeBracketPodium(bracketMatches);
    if (!podium) return;
    credit(podium.goldId, 'gold');
    credit(podium.silverId, 'silver');
    podium.bronzeIds.forEach(id => credit(id, 'bronze'));
  });

  return Array.from(tally.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.gold !== a.gold) return b.gold - a.gold;
    if (b.silver !== a.silver) return b.silver - a.silver;
    return b.bronze - a.bronze;
  });
}
