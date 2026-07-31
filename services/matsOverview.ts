import type { Match } from '../types';

export interface MatOverviewEntry {
  mat: string;
  current: Match | null;
  next: Match | null;
}

// One row per mat: whichever match is actually on the mat right now
// (status 'ongoing') plus the next fully-paired match already assigned to
// that mat waiting to be called. "Called to mat" itself stays an organizer
// action from Brackets (see App.tsx's onCallToMat) — this is read-only, a
// coordinator's at-a-glance view across every mat at once, distinct from the
// single-mat Timer/MatOperatorConsole.
export function computeMatsOverview(matches: Match[], mats: string[]): MatOverviewEntry[] {
  return mats.map(mat => {
    const current = matches.find(m => m.mat === mat && m.status === 'ongoing') ?? null;
    const next = matches.find(m => m.mat === mat && m.status === 'pending' && m.competitor1Id && m.competitor2Id) ?? null;
    return { mat, current, next };
  });
}
