import React, { useMemo } from 'react';
import type { Competitor, Match } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { computeMatsOverview } from '../services/matsOverview';

const MATS = ['1', '2', '3', '4', '5'];

interface MatsOverviewProps {
  competitors: Competitor[];
  matches: Match[];
  t: TranslationKeys;
}

const MatsOverview: React.FC<MatsOverviewProps> = ({ competitors, matches, t }) => {
  const overview = useMemo(() => computeMatsOverview(matches, MATS), [matches]);
  const getAthlete = (id: string | null | undefined) => competitors.find(c => c.id === id);

  const MatchPreview = ({ match }: { match: Match }) => {
    const a1 = getAthlete(match.competitor1Id);
    const a2 = getAthlete(match.competitor2Id);
    return (
      <p className="text-white font-bold truncate">
        {a1?.name ?? t.compPlaceholder} <span className="text-slate-600 font-normal">vs</span> {a2?.name ?? t.compPlaceholder}
      </p>
    );
  };

  return (
    <div className="p-4 md:p-10 animate-in fade-in duration-700">
      <div className="mb-12">
        <h2 className="text-4xl font-black text-white tracking-tight mb-2">{t.matsOverviewTitle}</h2>
        <p className="text-slate-500 font-medium">{t.matsOverviewSub}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {overview.map(entry => (
          <div key={entry.mat} className={`rounded-[2rem] border p-6 ${entry.current ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/40 border-slate-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-black uppercase tracking-widest text-white">{t.mat} {entry.mat}</span>
              {entry.current && (
                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> {t.active}
                </span>
              )}
            </div>

            <div className="mb-4">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 block mb-1">{t.matsOverviewCurrent}</span>
              {entry.current ? <MatchPreview match={entry.current} /> : <p className="text-slate-700 italic text-sm">{t.matsOverviewEmpty}</p>}
            </div>

            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 block mb-1">{t.matsOverviewNext}</span>
              {entry.next ? <MatchPreview match={entry.next} /> : <p className="text-slate-700 italic text-sm">{t.matsOverviewEmpty}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatsOverview;
