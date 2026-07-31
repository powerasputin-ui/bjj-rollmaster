import React, { useEffect, useState } from 'react';
import type { Competitor, Match, WeightCategory } from '../types';
import type { TranslationKeys } from '../translations';
import { publicApi } from '../services/api';
import BracketView from './BracketView';

interface PublicBracketsProps {
  t: TranslationKeys;
  slug: string;
}

const POLL_INTERVAL_MS = 4000;

// Read-only spectator view of a tournament's brackets — no login required.
// Self-contained (fetches its own data), matching the pattern already used
// by PublicRegister.tsx/AthleteCabinet.tsx rather than threading through
// App.tsx's organizer-only state.
const PublicBrackets: React.FC<PublicBracketsProps> = ({ t, slug }) => {
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [weightCategories, setWeightCategories] = useState<WeightCategory[]>([]);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [infoRes, compRes, matchRes, weightCatRes] = await Promise.all([
        publicApi.getTournamentInfo(slug),
        publicApi.getCompetitors(slug),
        publicApi.getMatches(slug),
        publicApi.getWeightCategories(slug),
      ]);
      if (cancelled) return;
      if (infoRes.ok === true) setTournamentName(infoRes.data.name);
      else setNotFound(true);
      if (compRes.ok) setCompetitors(compRes.data);
      if (matchRes.ok) setMatches(matchRes.data);
      if (weightCatRes.ok) setWeightCategories(weightCatRes.data);
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slug]);

  if (notFound) {
    return (
      <div className="min-h-screen bjj-gradient flex items-center justify-center p-6">
        <p className="text-slate-400 text-sm">{t.liveBracketsNotFound}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bjj-gradient">
      <div className="flex items-center gap-4 px-6 md:px-10 pt-8">
        <h1 className="text-xl font-black text-white tracking-tight uppercase truncate">{tournamentName ?? '…'}</h1>
        <span className="shrink-0 text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/30 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">
          {t.liveBadge}
        </span>
      </div>
      <BracketView competitors={competitors} matches={matches} setMatches={setMatches} weightCategories={weightCategories} t={t} readOnly />
    </div>
  );
};

export default PublicBrackets;
