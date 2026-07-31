import type { AgeCategory, Competitor, Match, WeightCategory } from '../types';
import type { TranslationKeys } from '../translations';
import { computeBracketPodium } from './bracketGenerator';

export interface ResultsMedalist {
  id: string;
  name: string;
  team: string;
}

export interface CategoryResult {
  bracketId: string;
  label: string;
  concluded: boolean;
  gold?: ResultsMedalist;
  silver?: ResultsMedalist;
  bronze: ResultsMedalist[];
}

// bracketId is always `${giOrNoGi}_${ageCategoryIdOrNone}_${ageGroup}_${belt}_${weightCategoryIdOrAbsolute}`
// (see BracketView.tsx's generateBracket) — category ids are UUIDs (no
// underscores), so splitting on '_' is safe and mirrors the same label
// construction BracketView.tsx's bracketCategories useMemo already does.
function categoryLabel(bracketId: string, weightCategories: WeightCategory[], ageCategories: AgeCategory[], t: TranslationKeys): string {
  const [format, ageCatKey, , belt, weightCatKey] = bracketId.split('_');
  const weightLabel = weightCatKey === 'absolute'
    ? t.openWeightLabel
    : weightCategories.find(wc => wc.id === weightCatKey)?.name ?? weightCatKey;
  const beltLabel = t.belts[belt as keyof typeof t.belts] ?? belt;
  const formatLabel = format === 'nogi' ? t.sparringFormatNoGi : t.sparringFormatGi;
  const ageCatName = ageCatKey && ageCatKey !== 'none' ? ageCategories.find(ac => ac.id === ageCatKey)?.name : undefined;
  return [formatLabel, ageCatName, beltLabel, weightLabel].filter(Boolean).join(' | ');
}

// Tournament-wide results summary — one row per category (bracketId), each
// with its concluded podium (or `concluded: false` while still in progress).
// Reuses computeBracketPodium so it stays consistent with BracketView.tsx's
// per-category podium and never re-derives the format-specific logic.
export function computeTournamentResults(
  matches: Match[],
  competitors: Competitor[],
  weightCategories: WeightCategory[],
  t: TranslationKeys,
  ageCategories: AgeCategory[] = []
): CategoryResult[] {
  const byId = new Map(competitors.map(c => [c.id, c]));
  const toMedalist = (id: string | null | undefined): ResultsMedalist | undefined => {
    if (!id) return undefined;
    const c = byId.get(id);
    return c ? { id: c.id, name: c.name, team: c.team } : undefined;
  };

  const byBracket = new Map<string, Match[]>();
  matches.forEach(m => {
    const list = byBracket.get(m.bracketId);
    if (list) list.push(m);
    else byBracket.set(m.bracketId, [m]);
  });

  return Array.from(byBracket.entries())
    .map(([bracketId, bracketMatches]) => {
      const podium = computeBracketPodium(bracketMatches);
      return {
        bracketId,
        label: categoryLabel(bracketId, weightCategories, ageCategories, t),
        concluded: podium !== null,
        gold: toMedalist(podium?.goldId),
        silver: toMedalist(podium?.silverId),
        bronze: (podium?.bronzeIds ?? []).map(toMedalist).filter((m): m is ResultsMedalist => !!m),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
