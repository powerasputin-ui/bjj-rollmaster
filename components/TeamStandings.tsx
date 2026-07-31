import React, { useMemo } from 'react';
import type { Competitor, Match } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { computeTeamStandings } from '../services/teamStandings';

interface TeamStandingsProps {
  competitors: Competitor[];
  matches: Match[];
  t: TranslationKeys;
}

const TeamStandings: React.FC<TeamStandingsProps> = ({ competitors, matches, t }) => {
  const standings = useMemo(() => computeTeamStandings(matches, competitors), [matches, competitors]);

  return (
    <div className="p-4 md:p-10 animate-in fade-in duration-700">
      <div className="mb-12">
        <h2 className="text-4xl font-black text-white tracking-tight mb-2">{t.teamStandings}</h2>
        <p className="text-slate-500 font-medium">{t.teamStandingsLegend}</p>
      </div>

      {standings.length === 0 ? (
        <div className="py-40 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/40 flex flex-col items-center">
          <div className="text-slate-800 mb-8 scale-[2]"><Icons.Medal /></div>
          <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.waitingForResults}</p>
        </div>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead>
              <tr className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <th className="pb-4">{t.standingsPlace}</th>
                <th className="pb-4">{t.team}</th>
                <th className="pb-4 text-right">{t.gold}</th>
                <th className="pb-4 text-right">{t.silver}</th>
                <th className="pb-4 text-right">{t.bronze}</th>
                <th className="pb-4 text-right">{t.points}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, i) => (
                <tr key={row.team} className="border-t border-slate-800/60">
                  <td className="py-4 text-white font-black">{i + 1}</td>
                  <td className="py-4 text-white font-bold truncate max-w-[240px]">{row.team}</td>
                  <td className="py-4 text-right text-amber-400 font-black">{row.gold}</td>
                  <td className="py-4 text-right text-slate-300 font-black">{row.silver}</td>
                  <td className="py-4 text-right text-orange-600 font-black">{row.bronze}</td>
                  <td className="py-4 text-right text-emerald-400 font-black">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeamStandings;
