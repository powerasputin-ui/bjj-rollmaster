
import React, { useState, useMemo } from 'react';
import { Competitor, Match, BeltColor } from '../types';
import type { TranslationKeys } from '../translations';

type BeltView = 'Adult' | 'Kid';

interface DashboardProps {
  competitors: Competitor[];
  matches: Match[];
  t: TranslationKeys;
  onSelectBelt?: (belt: BeltColor, ageGroup: BeltView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ competitors, matches, t, onSelectBelt }) => {
  const defaultBeltView: BeltView = competitors.filter(c => c.ageGroup === 'Adult').length >= competitors.filter(c => c.ageGroup === 'Kid').length ? 'Adult' : 'Kid';
  const [beltView, setBeltView] = useState<BeltView>(defaultBeltView);
  const isAdultBeltView = beltView === 'Adult';

  const upcomingMatches = useMemo(() => {
    return matches
      .filter(m => m.status === 'pending')
      .slice(0, 5)
      .map(m => ({
        ...m,
        comp1: competitors.find(c => c.id === m.competitor1Id),
        comp2: competitors.find(c => c.id === m.competitor2Id)
      }));
  }, [matches, competitors]);

  const teamStandings = useMemo(() => {
    const scores: Record<string, { total: number; gold: number; silver: number; bronze: number }> = {};
    const categories = Array.from(new Set(matches.map(m => m.bracketId)));

    categories.forEach(catId => {
      const catMatches = matches.filter(m => m.bracketId === catId);
      const maxRound = Math.max(...catMatches.map(m => m.round), 0);
      if (maxRound === 0) return;

      const finalMatch = catMatches.find(m => m.round === maxRound);
      if (finalMatch && finalMatch.status === 'finished' && finalMatch.winnerId) {
        const goldWinner = competitors.find(c => c.id === finalMatch.winnerId);
        if (goldWinner?.team) {
          if (!scores[goldWinner.team]) scores[goldWinner.team] = { total: 0, gold: 0, silver: 0, bronze: 0 };
          scores[goldWinner.team].gold += 1;
          scores[goldWinner.team].total += 9;
        }

        const silverId = finalMatch.winnerId === finalMatch.competitor1Id ? finalMatch.competitor2Id : finalMatch.competitor1Id;
        const silverWinner = competitors.find(c => c.id === silverId);
        if (silverWinner?.team) {
          if (!scores[silverWinner.team]) scores[silverWinner.team] = { total: 0, gold: 0, silver: 0, bronze: 0 };
          scores[silverWinner.team].silver += 1;
          scores[silverWinner.team].total += 3;
        }

        const semiFinals = catMatches.filter(m => m.round === maxRound - 1 && maxRound > 1);
        semiFinals.forEach(sf => {
          const loserId = sf.winnerId === sf.competitor1Id ? sf.competitor2Id : sf.competitor1Id;
          const bronzeWinner = competitors.find(c => c.id === loserId);
          if (bronzeWinner?.team) {
            if (!scores[bronzeWinner.team]) scores[bronzeWinner.team] = { total: 0, gold: 0, silver: 0, bronze: 0 };
            scores[bronzeWinner.team].bronze += 1;
            scores[bronzeWinner.team].total += 1;
          }
        });
      }
    });

    return Object.entries(scores)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [matches, competitors]);

  const liveMatchesCount = matches.filter(m => m.status === 'ongoing').length;
  const academiesCount = new Set(competitors.map(c => c.team).filter(Boolean)).size;

  const beltData: { key: BeltColor; name: string; count: number; color: string }[] = isAdultBeltView
    ? [
        { key: 'White', name: t.belts.White, count: competitors.filter(c => c.belt === 'White' && c.ageGroup === 'Adult').length, color: '#f8fafc' },
        { key: 'Blue', name: t.belts.Blue, count: competitors.filter(c => c.belt === 'Blue' && c.ageGroup === 'Adult').length, color: '#2563eb' },
        { key: 'Purple', name: t.belts.Purple, count: competitors.filter(c => c.belt === 'Purple' && c.ageGroup === 'Adult').length, color: '#7e22ce' },
        { key: 'Brown', name: t.belts.Brown, count: competitors.filter(c => c.belt === 'Brown' && c.ageGroup === 'Adult').length, color: '#78350f' },
        { key: 'Black', name: t.belts.Black, count: competitors.filter(c => c.belt === 'Black' && c.ageGroup === 'Adult').length, color: '#334155' },
      ]
    : [
        { key: 'White', name: t.belts.White, count: competitors.filter(c => c.belt === 'White' && c.ageGroup === 'Kid').length, color: '#f8fafc' },
        { key: 'Grey', name: t.belts.Grey, count: competitors.filter(c => c.belt === 'Grey' && c.ageGroup === 'Kid').length, color: '#94a3b8' },
        { key: 'Yellow', name: t.belts.Yellow, count: competitors.filter(c => c.belt === 'Yellow' && c.ageGroup === 'Kid').length, color: '#eab308' },
        { key: 'Orange', name: t.belts.Orange, count: competitors.filter(c => c.belt === 'Orange' && c.ageGroup === 'Kid').length, color: '#f97316' },
        { key: 'Green', name: t.belts.Green, count: competitors.filter(c => c.belt === 'Green' && c.ageGroup === 'Kid').length, color: '#10b981' },
      ];
  const maxBeltCount = Math.max(1, ...beltData.map(b => b.count));

  return (
    <div className="p-6 md:p-10 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white uppercase">{t.dashboard}</h2>
          <p className="text-slate-400 mt-1 text-sm font-medium">{t.dashboardSub}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard title={t.totalAthletes} value={competitors.length} color="bg-indigo-600 shadow-indigo-500/10" />
        <StatCard title={t.academies} value={academiesCount} color="bg-emerald-600 shadow-emerald-500/10" />
        <StatCard title={t.matchesToday} value={matches.length} color="bg-slate-900 border border-slate-800" />
        <StatCard title={t.active} value={liveMatchesCount} subtitle={t.liveMatchesSub} color={liveMatchesCount > 0 ? 'bg-rose-600 animate-pulse shadow-rose-500/20' : 'bg-slate-900 border border-slate-800'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col shadow-xl backdrop-blur-md">
            <h3 className="text-lg font-black text-white uppercase tracking-widest">{t.teamStandings}</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-8 mt-1">{t.teamStandingsLegend}</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-800 pb-4">
                    <th className="pb-4 text-[10px] font-black uppercase text-slate-500 tracking-widest">{t.team}</th>
                    <th className="pb-4 text-[10px] font-black uppercase text-slate-500 text-center tracking-widest">{t.gold}</th>
                    <th className="pb-4 text-[10px] font-black uppercase text-slate-500 text-center tracking-widest">{t.silver}</th>
                    <th className="pb-4 text-[10px] font-black uppercase text-slate-500 text-center tracking-widest">{t.bronze}</th>
                    <th className="pb-4 text-[10px] font-black uppercase text-slate-500 text-right tracking-widest">{t.points}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {teamStandings.map((team, idx) => (
                    <tr key={team.name} className="group hover:bg-white/5 transition-colors">
                      <td className="py-5">
                        <div className="flex items-center gap-4">
                          <span className="text-[11px] font-black text-slate-600">#{idx+1}</span>
                          <span className="text-sm font-bold text-white truncate">{team.name}</span>
                        </div>
                      </td>
                      <td className="py-5 text-center font-black text-amber-500 text-lg">{team.gold}</td>
                      <td className="py-5 text-center font-black text-slate-300 text-lg">{team.silver}</td>
                      <td className="py-5 text-center font-black text-orange-700 text-lg">{team.bronze}</td>
                      <td className="py-5 text-right">
                        <span className="px-4 py-1.5 bg-indigo-500/10 text-indigo-400 rounded-xl font-black text-xl border border-indigo-500/20">{team.total}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {teamStandings.length === 0 && <div className="text-center py-20 text-slate-600 text-[10px] uppercase font-black tracking-[0.3em] italic">{t.waitingForResults}</div>}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 backdrop-blur-md shadow-xl">
            <h3 className="text-sm font-black mb-8 text-white uppercase tracking-widest">{t.upcomingMatches}</h3>
            <div className="space-y-4">
              {upcomingMatches.map((m, i) => (
                <div key={m.id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between transition-all hover:border-slate-600">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] truncate">{t.mat} {m.mat || '?'}</p>
                    <p className="text-sm font-black text-white truncate mt-1">{m.comp1?.name || '?'} vs {m.comp2?.name || '?'}</p>
                  </div>
                  <div className={`ml-4 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${i === 0 ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                    {i === 0 ? t.onMat : t.ready}
                  </div>
                </div>
              ))}
              {upcomingMatches.length === 0 && <p className="text-center text-[10px] text-slate-600 italic font-black uppercase tracking-widest py-10">{t.noMatchesOnDeck}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 backdrop-blur-md shadow-xl mt-8">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">{t.distribution}</h3>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button type="button" onClick={() => setBeltView('Adult')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${isAdultBeltView ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>{t.beltViewAdult}</button>
            <button type="button" onClick={() => setBeltView('Kid')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${!isAdultBeltView ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-white'}`}>{t.beltViewKid}</button>
          </div>
        </div>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-8">{t.beltChartSub}</p>
        <div className="space-y-4">
          {beltData.map(belt => (
            <button
              key={belt.key}
              type="button"
              onClick={() => onSelectBelt?.(belt.key, beltView)}
              className="w-full flex items-center gap-4 group text-left"
            >
              <span className="w-28 shrink-0 text-[11px] font-black text-slate-400 uppercase tracking-wider truncate group-hover:text-white transition-colors">{belt.name}</span>
              <span className="flex-1 h-8 bg-slate-950 rounded-full border border-slate-800 overflow-hidden relative">
                <span
                  className="h-full rounded-full block transition-all group-hover:brightness-125"
                  style={{ width: `${Math.max(belt.count > 0 ? 4 : 0, (belt.count / maxBeltCount) * 100)}%`, backgroundColor: belt.color }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-sm font-black text-white tabular-nums">{belt.count}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, color, subtitle }: { title: string; value: number | string; color: string; subtitle?: string }) => (
  <div className={`${color} rounded-[2rem] p-8 border border-white/5 shadow-2xl transition-transform hover:scale-[1.02]`}>
    <h3 className="text-white/60 font-black uppercase tracking-[0.3em] text-[10px] mb-4">{title}</h3>
    <span className="text-5xl font-black text-white tabular-nums">{value}</span>
    {subtitle && <p className="text-white/50 font-bold text-[10px] uppercase tracking-widest mt-2">{subtitle}</p>}
  </div>
);

export default Dashboard;
