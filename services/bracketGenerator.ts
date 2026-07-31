import type { Competitor, Match, Score } from '../types';

// Pure, DOM-free bracket construction — kept separate from BracketView.tsx so
// the trickiest part of this feature (double elimination's losers-bracket
// wiring) is independently unit-testable without mounting a component.

const EMPTY_SCORE: Score = { points: 0, advantages: 0, penalties: 0 };

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function nextPowerOfTwo(n: number): number {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

// Seeds the pool so that, as far as possible, no round-1 match pairs two
// competitors from the same team — round-1 pairing is shuffled[i] vs
// shuffled[n-1-i] (see generateSingleEliminationMatches/
// generateDoubleEliminationMatches below), so what matters here is that
// those index pairs land on different teams. Approach: interleave teams
// round-robin (largest first) so same-team athletes start out spread apart,
// then a repair pass fixes any (i, n-1-i) pair that still collides by
// swapping in a competitor from elsewhere who doesn't create a new collision.
// Best-effort, not a guaranteed-optimal matching: when one team dominates the
// pool (e.g. more than half the field), some same-team round-1 pairings are
// mathematically unavoidable and are left in place rather than looping forever.
export function seedAvoidingSameTeam(pool: Competitor[]): Competitor[] {
  const byTeam = new Map<string, Competitor[]>();
  pool.forEach(c => {
    const list = byTeam.get(c.team);
    if (list) list.push(c);
    else byTeam.set(c.team, [c]);
  });
  const groups = Array.from(byTeam.values())
    .map(g => shuffle(g))
    .sort((a, b) => b.length - a.length);

  const order: Competitor[] = [];
  const cursors = groups.map(() => 0);
  let remaining = pool.length;
  while (remaining > 0) {
    for (let g = 0; g < groups.length; g++) {
      if (cursors[g] < groups[g].length) {
        order.push(groups[g][cursors[g]]);
        cursors[g]++;
        remaining--;
      }
    }
  }

  const n = order.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const j = n - 1 - i;
    if (order[i].team !== order[j].team) continue;
    for (let k = 0; k < n; k++) {
      if (k === i || k === j) continue;
      if (order[k].team === order[i].team) continue;
      const partnerOfK = n - 1 - k;
      const kPartner = order[partnerOfK];
      if (kPartner && kPartner.team === order[j].team) continue;
      [order[j], order[k]] = [order[k], order[j]];
      break;
    }
  }

  return order;
}

export function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

function legacySlot(matchId: string): 1 | 2 {
  return parseInt(matchId.split('idx').pop() || '0', 10) % 2 === 0 ? 1 : 2;
}

// A match's slot has "no feeder" only when nothing in the bracket points its
// nextMatchId/loserNextMatchId at that slot — used to distinguish a genuine
// bye (nobody will ever fill the other slot) from a match still waiting on
// an earlier round to finish. Round-1 matches have no feeders by
// construction, which is why the original single-elim code could hardcode
// "only round 1 has byes" — this generalizes that to any bracket shape.
function hasIncomingFeeder(all: Match[], targetId: string, slot: 1 | 2): boolean {
  return all.some(m => {
    if (m.nextMatchId === targetId && (m.nextMatchSlot ?? legacySlot(m.id)) === slot) return true;
    if (m.loserNextMatchId === targetId && (m.loserNextMatchSlot ?? 1) === slot) return true;
    return false;
  });
}

// Shared advancement pass for single- and double-elimination brackets:
// resolves byes, then propagates winners via nextMatchId and (for double
// elimination) losers via loserNextMatchId, repeating until nothing changes.
// A no-op for round robin (which never sets nextMatchId/loserNextMatchId).
function propagateBracket(all: Match[], byeLabel: string): void {
  let changed = true;
  while (changed) {
    changed = false;
    all.forEach(m => {
      if (m.status === 'pending') {
        const c1 = m.competitor1Id;
        const c2 = m.competitor2Id;
        if (c1 && !c2 && !hasIncomingFeeder(all, m.id, 2)) {
          m.winnerId = c1; m.status = 'finished'; m.winMethod = byeLabel; changed = true;
        } else if (!c1 && c2 && !hasIncomingFeeder(all, m.id, 1)) {
          m.winnerId = c2; m.status = 'finished'; m.winMethod = byeLabel; changed = true;
        }
      }

      if (m.status === 'finished' && m.winnerId) {
        if (m.nextMatchId) {
          const nextM = all.find(nm => nm.id === m.nextMatchId);
          if (nextM) {
            const slot = m.nextMatchSlot ?? legacySlot(m.id);
            if (slot === 1 && nextM.competitor1Id !== m.winnerId) { nextM.competitor1Id = m.winnerId; changed = true; }
            if (slot === 2 && nextM.competitor2Id !== m.winnerId) { nextM.competitor2Id = m.winnerId; changed = true; }
          }
        }
        // Loser advancement (double elimination only) — only for matches that
        // were actually contested (a bye has no real loser to send anywhere).
        if (m.loserNextMatchId && m.competitor1Id && m.competitor2Id) {
          const loserId = m.winnerId === m.competitor1Id ? m.competitor2Id : m.competitor1Id;
          const nextM = all.find(nm => nm.id === m.loserNextMatchId);
          if (nextM) {
            const slot = m.loserNextMatchSlot ?? 1;
            if (slot === 1 && nextM.competitor1Id !== loserId) { nextM.competitor1Id = loserId; changed = true; }
            if (slot === 2 && nextM.competitor2Id !== loserId) { nextM.competitor2Id = loserId; changed = true; }
          }
        }
      }
    });
  }
}

function baseMatch(id: string, round: number, bracketId: string, mat: string): Match {
  return {
    id,
    competitor1Id: null,
    competitor2Id: null,
    score1: { ...EMPTY_SCORE },
    score2: { ...EMPTY_SCORE },
    status: 'pending',
    round,
    bracketId,
    mat,
  };
}

// ---------------------------------------------------------------------------
// Single elimination — moved verbatim (same shuffling/seeding/bye behavior)
// from BracketView.tsx's original generateBracket, just as a standalone
// function so it can share propagateBracket with the new formats.
// ---------------------------------------------------------------------------
export function generateSingleEliminationMatches(pool: Competitor[], catKey: string, mat: string, byeLabel: string): Match[] {
  const shuffled = seedAvoidingSameTeam(pool);
  const poolSize = shuffled.length;
  const bracketSize = nextPowerOfTwo(poolSize);
  const matchMap = new Map<string, Match>();
  const totalRounds = Math.log2(bracketSize);

  for (let r = 1; r <= totalRounds; r++) {
    const matchesInRound = bracketSize / Math.pow(2, r);
    for (let i = 0; i < matchesInRound; i++) {
      const id = `m_${catKey}_r${r}_idx${i}`;
      const m = baseMatch(id, r, catKey, mat);
      m.nextMatchId = r < totalRounds ? `m_${catKey}_r${r + 1}_idx${Math.floor(i / 2)}` : undefined;
      m.format = 'single';
      matchMap.set(id, m);
    }
  }

  for (let i = 0; i < bracketSize / 2; i++) {
    const m = matchMap.get(`m_${catKey}_r1_idx${i}`);
    if (m) {
      m.competitor1Id = shuffled[i] ? shuffled[i].id : null;
      m.competitor2Id = shuffled[bracketSize - 1 - i] ? shuffled[bracketSize - 1 - i].id : null;
    }
  }

  const finalizedMatches = Array.from(matchMap.values());
  propagateBracket(finalizedMatches, byeLabel);
  return finalizedMatches;
}

// ---------------------------------------------------------------------------
// Round robin — circle method. Every competitor plays every other exactly
// once; no advancement, standings are computed afterward from win counts.
// ---------------------------------------------------------------------------
export function generateRoundRobinMatches(pool: Competitor[], catKey: string, mat: string): Match[] {
  const ids = shuffle(pool).map(c => c.id);
  const withBye: (string | null)[] = ids.length % 2 === 0 ? [...ids] : [...ids, null];
  const n = withBye.length;
  const totalRounds = n - 1;
  const half = n / 2;
  const matches: Match[] = [];
  let arrangement = [...withBye];

  for (let r = 1; r <= totalRounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = arrangement[i];
      const b = arrangement[n - 1 - i];
      if (a !== null && b !== null) {
        const m = baseMatch(`m_${catKey}_rr_r${r}_idx${i}`, r, catKey, mat);
        m.competitor1Id = a;
        m.competitor2Id = b;
        m.format = 'round_robin';
        matches.push(m);
      }
      // a or b === null means that competitor sits out this round — no match, no penalty.
    }
    const fixed = arrangement[0];
    const rest = arrangement.slice(1);
    rest.unshift(rest.pop() as string | null);
    arrangement = [fixed, ...rest];
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Double elimination — winners bracket (identical shape to single-elim) +
// losers bracket (standard alternating "drop-down" / "survivors-only" rounds)
// + a single Grand Final (no bracket reset — see plan doc). Restricted to
// power-of-two pools: that guarantees zero byes anywhere in the winners
// bracket, which in turn guarantees the losers bracket never has to handle a
// pairing where both feeders are bye-matches with no real loser to send it —
// correctly handling that cascade for arbitrary pool sizes is a much deeper
// problem than this tool needs to solve. Callers should offer Single
// Elimination or Round Robin instead when the pool isn't a power of two.
// ---------------------------------------------------------------------------
export function generateDoubleEliminationMatches(pool: Competitor[], catKey: string, mat: string, byeLabel: string): Match[] {
  if (pool.length <= 2) {
    // Nothing meaningful to double-eliminate with 0-2 players — one match decides it.
    return generateSingleEliminationMatches(pool, catKey, mat, byeLabel).map(m => ({ ...m, format: 'double' as const, bracketSection: 'final' as const }));
  }
  if (!isPowerOfTwo(pool.length)) {
    throw new Error('double_elimination_requires_power_of_two');
  }

  const shuffled = seedAvoidingSameTeam(pool);
  const bracketSize = shuffled.length;
  const k = Math.log2(bracketSize);
  const all: Match[] = [];

  // ---- Winners bracket ----
  const wbRounds: Match[][] = [];
  for (let r = 1; r <= k; r++) {
    const count = bracketSize / Math.pow(2, r);
    const round: Match[] = [];
    for (let i = 0; i < count; i++) {
      const m = baseMatch(`m_${catKey}_wb_r${r}_idx${i}`, r, catKey, mat);
      m.format = 'double';
      m.bracketSection = 'winners';
      round.push(m);
    }
    wbRounds.push(round);
    all.push(...round);
  }
  for (let i = 0; i < bracketSize / 2; i++) {
    wbRounds[0][i].competitor1Id = shuffled[i].id;
    wbRounds[0][i].competitor2Id = shuffled[bracketSize - 1 - i].id;
  }
  for (let r = 0; r < k - 1; r++) {
    wbRounds[r].forEach((m, i) => {
      const target = wbRounds[r + 1][Math.floor(i / 2)];
      m.nextMatchId = target.id;
      m.nextMatchSlot = i % 2 === 0 ? 1 : 2;
    });
  }

  // ---- Losers bracket ----
  let lbRoundCounter = 1;
  const lbR1: Match[] = [];
  for (let i = 0; i < wbRounds[0].length / 2; i++) {
    const feederA = wbRounds[0][i * 2];
    const feederB = wbRounds[0][i * 2 + 1];
    const m = baseMatch(`m_${catKey}_lb_r${lbRoundCounter}_idx${i}`, lbRoundCounter, catKey, mat);
    m.format = 'double';
    m.bracketSection = 'losers';
    feederA.loserNextMatchId = m.id; feederA.loserNextMatchSlot = 1;
    feederB.loserNextMatchId = m.id; feederB.loserNextMatchSlot = 2;
    lbR1.push(m);
  }
  all.push(...lbR1);
  lbRoundCounter++;

  let survivors = lbR1;
  for (let wbR = 2; wbR <= k; wbR++) {
    const wbLosers = wbRounds[wbR - 1];
    const dropDown: Match[] = [];
    const count = Math.min(survivors.length, wbLosers.length);
    for (let i = 0; i < count; i++) {
      const s = survivors[i];
      const wl = wbLosers[i];
      const m = baseMatch(`m_${catKey}_lb_r${lbRoundCounter}_idx${i}`, lbRoundCounter, catKey, mat);
      m.format = 'double';
      m.bracketSection = 'losers';
      s.nextMatchId = m.id; s.nextMatchSlot = 1;
      wl.loserNextMatchId = m.id; wl.loserNextMatchSlot = 2;
      dropDown.push(m);
    }
    all.push(...dropDown);
    lbRoundCounter++;
    survivors = dropDown;

    if (wbR < k && survivors.length > 1) {
      const survivorsOnly: Match[] = [];
      for (let i = 0; i < survivors.length / 2; i++) {
        const s1 = survivors[i * 2];
        const s2 = survivors[i * 2 + 1];
        const m = baseMatch(`m_${catKey}_lb_r${lbRoundCounter}_idx${i}`, lbRoundCounter, catKey, mat);
        m.format = 'double';
        m.bracketSection = 'losers';
        s1.nextMatchId = m.id; s1.nextMatchSlot = 1;
        s2.nextMatchId = m.id; s2.nextMatchSlot = 2;
        survivorsOnly.push(m);
      }
      all.push(...survivorsOnly);
      lbRoundCounter++;
      survivors = survivorsOnly;
    }
  }

  const lbFinal = survivors[0];

  // ---- Grand Final ----
  const wbFinal = wbRounds[k - 1][0];
  const grandFinal = baseMatch(`m_${catKey}_gf`, 1, catKey, mat);
  grandFinal.format = 'double';
  grandFinal.bracketSection = 'final';
  wbFinal.nextMatchId = grandFinal.id; wbFinal.nextMatchSlot = 1;
  lbFinal.nextMatchId = grandFinal.id; lbFinal.nextMatchSlot = 2;
  all.push(grandFinal);

  propagateBracket(all, byeLabel);
  return all;
}

export interface RoundRobinStanding {
  id: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

// Full round-robin standings, single source of truth for both the podium
// (computeBracketPodium below) and BracketView.tsx's standings table — they
// used to keep two independently-drifting win-counting implementations.
// Tiebreak when wins are equal: point differential, then total points
// scored. Not a full head-to-head resolution (which needs a cycle-breaking
// algorithm for A>B>C>A ties) — this simpler cascade is standard for club
// round-robins and never leaves the ranking ambiguous.
export function computeRoundRobinStandings(matches: Match[]): RoundRobinStanding[] {
  const byId = new Map<string, RoundRobinStanding>();
  const ensure = (id: string): RoundRobinStanding => {
    let s = byId.get(id);
    if (!s) {
      s = { id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
      byId.set(id, s);
    }
    return s;
  };
  matches.forEach(m => {
    if (m.competitor1Id) ensure(m.competitor1Id);
    if (m.competitor2Id) ensure(m.competitor2Id);
    if (m.status === 'finished' && m.winnerId && m.competitor1Id && m.competitor2Id) {
      const loserId = m.winnerId === m.competitor1Id ? m.competitor2Id : m.competitor1Id;
      const winnerPoints = m.winnerId === m.competitor1Id ? m.score1.points : m.score2.points;
      const loserPoints = m.winnerId === m.competitor1Id ? m.score2.points : m.score1.points;
      const winner = ensure(m.winnerId);
      const loser = ensure(loserId);
      winner.wins += 1;
      winner.pointsFor += winnerPoints;
      winner.pointsAgainst += loserPoints;
      loser.losses += 1;
      loser.pointsFor += loserPoints;
      loser.pointsAgainst += winnerPoints;
    }
  });
  return Array.from(byId.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;
    return b.pointsFor - a.pointsFor;
  });
}

export interface BracketPodium {
  goldId?: string;
  silverId?: string | null;
  bronzeIds: string[];
}

// Shared podium computation for one bracket's worth of matches (all sharing a
// bracketId) — format-aware so BracketView.tsx and team-standings tallying
// (services/teamStandings.ts) never have to duplicate this logic three ways.
// Returns null when the category hasn't concluded yet (no matches, or the
// deciding match(es) aren't finished).
export function computeBracketPodium(matches: Match[]): BracketPodium | null {
  if (matches.length === 0) return null;
  const format: Match['format'] = matches[0]?.format ?? 'single';

  if (format === 'round_robin') {
    const allFinished = matches.every(m => m.status === 'finished');
    if (!allFinished) return null;
    const standings = computeRoundRobinStandings(matches);
    return {
      goldId: standings[0]?.id,
      silverId: standings[1]?.id,
      bronzeIds: standings[2] ? [standings[2].id] : [],
    };
  }

  if (format === 'double') {
    const finalMatch = matches.find(m => m.bracketSection === 'final');
    if (!finalMatch || finalMatch.status !== 'finished' || !finalMatch.winnerId) return null;
    const goldId = finalMatch.winnerId;
    const silverId = finalMatch.winnerId === finalMatch.competitor1Id ? finalMatch.competitor2Id : finalMatch.competitor1Id;
    const losersMatches = matches.filter(m => m.bracketSection === 'losers');
    const lbMaxRound = losersMatches.length > 0 ? Math.max(...losersMatches.map(m => m.round)) : 0;
    const lbFinal = losersMatches.find(m => m.round === lbMaxRound);
    const bronzeId = lbFinal && lbFinal.status === 'finished' && lbFinal.winnerId
      ? (lbFinal.winnerId === lbFinal.competitor1Id ? lbFinal.competitor2Id : lbFinal.competitor1Id)
      : null;
    return { goldId, silverId, bronzeIds: bronzeId ? [bronzeId] : [] };
  }

  const maxRoundNum = Math.max(...matches.map(m => m.round));
  const finalMatch = matches.find(m => m.round === maxRoundNum);
  if (!finalMatch || finalMatch.status !== 'finished' || !finalMatch.winnerId) return null;
  const goldId = finalMatch.winnerId;
  const silverId = finalMatch.winnerId === finalMatch.competitor1Id ? finalMatch.competitor2Id : finalMatch.competitor1Id;
  const semiFinals = matches.filter(m => m.round === maxRoundNum - 1 && maxRoundNum > 1);
  const bronzeIds = semiFinals
    .map(sf => (sf.winnerId === sf.competitor1Id ? sf.competitor2Id : sf.competitor1Id))
    .filter((id): id is string => !!id);
  return { goldId, silverId, bronzeIds };
}
