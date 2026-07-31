
import React, { useState, useMemo } from 'react';
import { Competitor, Match, AgeGroup, AgeCategory, BracketFormat, SparringFormat, WeightCategory, getWeightCategoryKey, orderedCategoryIds } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { api } from '../services/api';
import { generateSingleEliminationMatches, generateRoundRobinMatches, generateDoubleEliminationMatches, computeBracketPodium, computeRoundRobinStandings } from '../services/bracketGenerator';

interface BracketProps {
  competitors: Competitor[];
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  setCompetitors?: React.Dispatch<React.SetStateAction<Competitor[]>>;
  weightCategories: WeightCategory[];
  ageCategories?: AgeCategory[];
  t: TranslationKeys;
  onCallToMat?: (matchId: string, matId: string) => void;
  readOnly?: boolean;
  defaultBracketFormat?: BracketFormat;
  sparringFormat?: SparringFormat;
}

interface BracketRoundsProps {
  matches: Match[];
  getAthlete: (id: string | null | undefined) => Competitor | undefined;
  t: TranslationKeys;
  readOnly: boolean;
  onCallToMat?: (matchId: string, matId: string) => void;
  setFinishingMatch: (v: { matchId: string; winnerId: string } | null) => void;
}

const BracketRounds: React.FC<BracketRoundsProps> = ({ matches, getAthlete, t, readOnly, onCallToMat, setFinishingMatch }) => {
  const maxRoundNum = matches.length > 0 ? Math.max(...matches.map(m => m.round)) : 0;
  return (
    <div className="flex items-start gap-12 overflow-x-auto pb-12 pt-8 min-h-[200px] snap-x custom-scrollbar">
      {Array.from({ length: maxRoundNum }, (_, i) => i + 1).map(roundNum => (
        <div key={roundNum} className="flex flex-col justify-start gap-12 min-w-[340px] snap-center">
          <div className="text-center shrink-0">
            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] bg-indigo-500/10 px-8 py-3 rounded-full border border-indigo-500/20 whitespace-nowrap inline-block shadow-sm">
              {roundNum === maxRoundNum ? t.final : roundNum === maxRoundNum - 1 ? t.semiFinal : `${t.round} ${roundNum}`}
            </span>
          </div>
          <div className="flex flex-col justify-around flex-1 gap-10">
            {matches.filter(m => m.round === roundNum).map(m => (
              <div key={m.id} className={`bg-slate-900/60 backdrop-blur-md border transition-all duration-300 shadow-xl relative group rounded-[2.5rem] p-5 ${m.winnerId ? 'border-emerald-500/30' : (m.status === 'ongoing' ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800/60')}`}>
                <div className="space-y-4">
                  {[1, 2].map(idx => {
                    const athleteId = idx === 1 ? m.competitor1Id : m.competitor2Id;
                    const athlete = getAthlete(athleteId);
                    const isWinner = m.winnerId === athleteId;
                    const isLoser = m.winnerId && m.winnerId !== athleteId;
                    return (
                      <div key={idx} onClick={() => !readOnly && athlete && !m.winnerId && setFinishingMatch({ matchId: m.id, winnerId: athlete.id })} className={`flex flex-col p-3.5 rounded-2xl transition-all duration-300 ${athlete ? (m.winnerId || readOnly ? '' : 'cursor-pointer hover:bg-slate-800/80 active:scale-95') : 'bg-slate-950/40 border border-slate-800/40 border-dashed'} ${isWinner ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20' : ''} ${isLoser ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex flex-col min-w-0">
                             <span className={`text-xs font-black truncate leading-tight tracking-wide ${athlete ? (isWinner ? 'text-emerald-400' : 'text-white') : 'text-slate-700 italic'}`}>{athlete ? athlete.name : '...'}</span>
                             {athlete && <span className="text-[9px] font-bold text-slate-500 uppercase truncate mt-0.5 tracking-tighter">{athlete.team}</span>}
                          </div>
                          {isWinner && <div className="bg-emerald-500 text-slate-950 rounded-full p-1 shadow-lg shadow-emerald-500/20"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!m.winnerId && m.competitor1Id && m.competitor2Id && (
                  <div className="mt-5 pt-4 border-t border-slate-800/50 flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]"></div>
                       <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.mat} {m.mat || "1"}</span>
                    </div>
                    {!readOnly && (
                      <button onClick={(e) => { e.stopPropagation(); onCallToMat?.(m.id, m.mat || "1"); }} className="print:hidden text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20 active:scale-95 transition-all">{t.callToMat}</button>
                    )}
                  </div>
                )}
                {m.winMethod && (
                  <div className="mt-4 text-center">
                     <span className="text-[9px] font-black text-slate-500 uppercase bg-slate-950 px-3 py-1 rounded-full border border-slate-800 tracking-tighter italic">{m.winMethod}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const BracketView: React.FC<BracketProps> = ({ competitors, matches, setMatches, setCompetitors, weightCategories, ageCategories = [], t, onCallToMat, readOnly = false, defaultBracketFormat = 'single', sparringFormat = 'gi' }) => {
  const [selectedAge, setSelectedAge] = useState<AgeGroup | 'All'>('All');
  const [selectedSparringFilter, setSelectedSparringFilter] = useState<'All' | 'gi' | 'nogi'>('All');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMat, setSelectedMat] = useState<string>("1");
  const [selectedFormat, setSelectedFormat] = useState<BracketFormat>(defaultBracketFormat);
  const [finishingMatch, setFinishingMatch] = useState<{ matchId: string, winnerId: string } | null>(null);
  const [winMethod, setWinMethod] = useState<string>('Points');
  const [winComment, setWinComment] = useState<string>('');

  const orderedIdsByAge = useMemo(() => ({
    Adult: orderedCategoryIds(weightCategories, 'Adult'),
    Kid: orderedCategoryIds(weightCategories, 'Kid'),
  }), [weightCategories]);

  // Every competitor's format(s) — a competitor entered in both Gi and No-Gi
  // shows up in TWO independent category buckets below, exactly like
  // isAbsolute already creates a second bucket on top of the primary one.
  const formatsOf = (c: Competitor): ('gi' | 'nogi')[] => {
    const fmts: ('gi' | 'nogi')[] = [];
    if (c.competesGi !== false) fmts.push('gi');
    if (c.competesNoGi) fmts.push('nogi');
    return fmts;
  };

  const bracketCategories = useMemo(() => {
    const cats = new Map<string, { label: string; count: number; madeWeightCount: number; age: string; weightCat: string; belt: string; format: string }>();
    competitors.forEach(c => {
      const weightCat = getWeightCategoryKey(c.weight, c.ageGroup, weightCategories);
      const ageCatKey = c.ageCategoryId || 'none';
      const ageCatName = ageCatKey !== 'none' ? ageCategories.find(ac => ac.id === ageCatKey)?.name : undefined;
      formatsOf(c).forEach(format => {
        const formatLabel = format === 'gi' ? t.sparringFormatGi : t.sparringFormatNoGi;
        const weightKey = `${format}_${ageCatKey}_${c.ageGroup}_${c.belt}_${weightCat}`;
        if (!cats.has(weightKey)) {
          const label = weightCategories.find(wc => wc.id === weightCat)?.name || weightCat;
          cats.set(weightKey, {
            label: [formatLabel, ageCatName, t.belts[c.belt], label].filter(Boolean).join(' | '),
            count: 0, madeWeightCount: 0, age: c.ageGroup, weightCat, belt: c.belt, format
          });
        }
        const w = cats.get(weightKey);
        if (w) { w.count += 1; if (c.madeWeight) w.madeWeightCount += 1; }

        if (c.isAbsolute) {
          const absKey = `${format}_${ageCatKey}_${c.ageGroup}_${c.belt}_absolute`;
          if (!cats.has(absKey)) {
            cats.set(absKey, { label: [formatLabel, ageCatName, t.belts[c.belt], t.openWeightLabel].filter(Boolean).join(' | '), count: 0, madeWeightCount: 0, age: c.ageGroup, weightCat: 'absolute', belt: c.belt, format });
          }
          const a = cats.get(absKey);
          if (a) { a.count += 1; if (c.madeWeight) a.madeWeightCount += 1; }
        }
      });
    });
    const rank = (age: string, weightCat: string) => {
      if (weightCat === 'absolute') return 100;
      const idx = orderedIdsByAge[age as AgeGroup]?.indexOf(weightCat) ?? -1;
      return idx === -1 ? 999 : idx;
    };
    return Array.from(cats.entries())
      .filter(([_, data]) => selectedAge === 'All' || data.age === selectedAge)
      .filter(([_, data]) => selectedSparringFilter === 'All' || data.format === selectedSparringFilter)
      .sort((a, b) => {
        if (a[1].format !== b[1].format) return a[1].format.localeCompare(b[1].format);
        if (a[1].age !== b[1].age) return a[1].age.localeCompare(b[1].age);
        const weightA = rank(a[1].age, a[1].weightCat);
        const weightB = rank(b[1].age, b[1].weightCat);
        return (weightA !== weightB) ? (weightA - weightB) : a[1].belt.localeCompare(b[1].belt);
      });
  }, [competitors, t, selectedAge, selectedSparringFilter, weightCategories, ageCategories, orderedIdsByAge]);

  const generateBracket = (catKey: string) => {
    const existing = matches.some(m => m.bracketId === catKey);
    if (existing && !confirm(t.resetDesc)) return;

    const [format, ageCatKey, age, belt, catWeightKey] = catKey.split('_');
    const pool = competitors.filter(c => {
      if (c.ageGroup !== age || c.belt !== belt) return false;
      if (!formatsOf(c).includes(format as 'gi' | 'nogi')) return false;
      if ((c.ageCategoryId || 'none') !== ageCatKey) return false;
      return catWeightKey === 'absolute' ? c.isAbsolute : getWeightCategoryKey(c.weight, c.ageGroup as AgeGroup, weightCategories) === catWeightKey;
    });

    if (pool.length < 2) return alert(t.noAthletes);

    let finalizedMatches: Match[];
    try {
      if (selectedFormat === 'double') {
        finalizedMatches = generateDoubleEliminationMatches(pool, catKey, selectedMat, t.bye);
      } else if (selectedFormat === 'round_robin') {
        finalizedMatches = generateRoundRobinMatches(pool, catKey, selectedMat);
      } else {
        finalizedMatches = generateSingleEliminationMatches(pool, catKey, selectedMat, t.bye);
      }
    } catch {
      alert(t.bracketFormatDoublePowerOfTwoError);
      return;
    }

    setMatches(prev => [...prev.filter(m => m.bracketId !== catKey), ...finalizedMatches]);
    api.putBracketMatches(catKey, finalizedMatches).then(res => {
      if (res.ok === false) alert(t.adminTokenInvalid);
    });
  };

  const confirmWinner = () => {
    if (!finishingMatch) return;
    const { matchId, winnerId } = finishingMatch;
    const current = matches.find(m => m.id === matchId);
    if (!current) return;

    const winMethodLabel = `${t[winMethod.toLowerCase() + 'Win'] || winMethod}${winComment ? ': ' + winComment : ''}`;

    const loserId = winnerId === current.competitor1Id ? current.competitor2Id : current.competitor1Id;

    setMatches(prev => {
      let nextState = prev.map(m => m.id === matchId ? {
        ...m,
        winnerId,
        status: 'finished' as const,
        winMethod: winMethodLabel
      } : m);

      if (current.nextMatchId) {
        const isFirst = current.nextMatchSlot ? current.nextMatchSlot === 1 : parseInt(matchId.split('idx').pop() || '0') % 2 === 0;
        nextState = nextState.map(nm => {
          if (nm.id === current.nextMatchId) {
            return isFirst ? { ...nm, competitor1Id: winnerId } : { ...nm, competitor2Id: winnerId };
          }
          return nm;
        });
      }

      if (current.loserNextMatchId && loserId) {
        const isFirst = current.loserNextMatchSlot !== 2;
        nextState = nextState.map(nm => {
          if (nm.id === current.loserNextMatchId) {
            return isFirst ? { ...nm, competitor1Id: loserId } : { ...nm, competitor2Id: loserId };
          }
          return nm;
        });
      }
      return nextState;
    });
    setFinishingMatch(null);
    setWinComment('');

    api.finishMatch(matchId, {
      winnerId,
      method: winMethodLabel,
      score1: current.score1,
      score2: current.score2,
      logs: current.logs ?? [],
    }).then(res => {
      if (res.ok === false) alert(t.adminTokenInvalid);
    });
  };

  const getAthlete = (id: string | null | undefined) => competitors.find(c => c.id === id);
  const currentMatches = matches.filter(m => m.bracketId === selectedCategory);
  const currentFormat: BracketFormat = currentMatches[0]?.format ?? 'single';

  const isAbsoluteCategory = selectedCategory?.split('_').pop() === 'absolute';

  const winnersMatches = useMemo(() => currentMatches.filter(m => m.bracketSection === 'winners'), [currentMatches]);
  const losersMatches = useMemo(() => currentMatches.filter(m => m.bracketSection === 'losers'), [currentMatches]);
  const finalMatches = useMemo(() => currentMatches.filter(m => m.bracketSection === 'final'), [currentMatches]);

  const standings = useMemo(() => {
    if (currentFormat !== 'round_robin' || currentMatches.length === 0) return null;
    return computeRoundRobinStandings(currentMatches);
  }, [currentFormat, currentMatches]);

  const podium = useMemo(() => computeBracketPodium(currentMatches), [currentMatches]);

  const promoteToAbsolute = (competitorId: string) => {
    setCompetitors?.(prev => prev.map(c => c.id === competitorId ? { ...c, isAbsolute: true } : c));
    api.patchCompetitor(competitorId, { isAbsolute: true }).then(res => {
      if (res.ok === false) alert(t.adminTokenInvalid);
    });
  };

  const PodiumSlot = ({ place, athleteId }: { place: 'first' | 'second' | 'third'; athleteId?: string | null }) => {
    const athlete = athleteId ? getAthlete(athleteId) : undefined;
    if (!athlete) return null;
    const label = place === 'first' ? t.firstPlace : place === 'second' ? t.secondPlace : t.thirdPlace;
    const accent = place === 'first' ? 'border-amber-500/40 bg-amber-500/10' : place === 'second' ? 'border-slate-400/30 bg-slate-400/10' : 'border-orange-700/30 bg-orange-700/10';
    const labelColor = place === 'first' ? 'text-amber-400' : place === 'second' ? 'text-slate-300' : 'text-orange-600';
    return (
      <div className={`flex-1 min-w-[220px] rounded-[2rem] border p-6 ${accent}`}>
        <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${labelColor}`}>{label}</span>
        <p className="text-lg font-black text-white truncate mt-2">{athlete.name || t.compPlaceholder}</p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate mt-1">{athlete.team}</p>
        {!isAbsoluteCategory && setCompetitors && (
          athlete.isAbsolute ? (
            <span className="inline-block mt-4 text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">{t.alreadyInAbsolute}</span>
          ) : (
            <button onClick={() => promoteToAbsolute(athlete.id)} className="mt-4 text-[9px] font-black uppercase tracking-widest text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-all active:scale-95">{t.promoteToAbsolute}</button>
          )
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-10 animate-in fade-in duration-700">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-12 gap-8">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight mb-2">{t.brackets}</h2>
          <p className="text-slate-500 font-medium">{t.bracketSub}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto print:hidden">
          <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 p-1.5 rounded-2xl flex gap-1 h-fit shadow-lg">
            {(['All', 'Adult', 'Kid'] as const).map(age => (
              <button key={age} onClick={() => { setSelectedAge(age); setSelectedCategory(null); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 ${selectedAge === age ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}>
                {age === 'All' ? t.allCategories : (age === 'Adult' ? t.adult : t.kid)}
              </button>
            ))}
          </div>
          {sparringFormat === 'both' && (
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 p-1.5 rounded-2xl flex gap-1 h-fit shadow-lg">
              {(['All', 'gi', 'nogi'] as const).map(fmt => (
                <button key={fmt} onClick={() => { setSelectedSparringFilter(fmt); setSelectedCategory(null); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 ${selectedSparringFilter === fmt ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}>
                  {fmt === 'All' ? t.allCategories : (fmt === 'gi' ? t.sparringFormatGi : t.sparringFormatNoGi)}
                </button>
              ))}
            </div>
          )}
          <select value={selectedCategory ?? ''} onChange={(e) => { setSelectedCategory(e.target.value || null); setSelectedFormat(defaultBracketFormat); }} className="bg-slate-900/60 backdrop-blur-md border border-slate-700/60 text-white rounded-2xl px-6 py-4 outline-none font-black shadow-2xl text-[11px] uppercase tracking-widest min-w-[320px] flex-1 cursor-pointer focus:border-indigo-500 transition-colors">
            <option value="">{t.allCategories}</option>
            {bracketCategories.map(([key, data]) => (<option key={key} value={key}>{data.label} ({data.madeWeightCount}/{data.count})</option>))}
          </select>
          {!readOnly && selectedCategory && currentMatches.length > 0 && (
            <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest px-6 py-4 rounded-2xl transition-all active:scale-95 shrink-0">{t.printButton}</button>
          )}
        </div>
      </div>

      {!selectedCategory ? (
        <div className="py-40 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/40 flex flex-col items-center">
          <div className="text-slate-800 mb-8 scale-[2]"><Icons.Trophy /></div>
          <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.allCategories}</p>
        </div>
      ) : currentMatches.length === 0 ? (
        readOnly ? (
          <div className="py-32 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/40 flex flex-col items-center">
            <div className="text-slate-800 mb-8 scale-[2]"><Icons.Trophy /></div>
            <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.liveBracketsEmpty}</p>
          </div>
        ) : (
        <div className="py-32 text-center bg-slate-900/40 backdrop-blur-sm rounded-[3rem] border-2 border-indigo-500/10 flex flex-col items-center gap-10 shadow-2xl border-dashed">
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.bracketFormatOverrideLabel}</label>
              <div className="bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shadow-inner flex gap-1">
                {([
                  ['single', t.bracketFormatSingle],
                  ['double', t.bracketFormatDouble],
                  ['round_robin', t.bracketFormatRoundRobin],
                ] as [BracketFormat, string][]).map(([value, label]) => (
                  <button key={value} onClick={() => setSelectedFormat(value)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${selectedFormat === value ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-500 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-3xl border border-slate-800 shadow-inner">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-2">{t.assignMat}:</label>
              <select value={selectedMat} onChange={(e) => setSelectedMat(e.target.value)} className="bg-slate-900 border border-slate-700 text-white px-5 py-2 rounded-xl text-xs font-black outline-none cursor-pointer hover:border-indigo-500 transition-colors">
                {[1, 2, 3, 4, 5].map(m => <option key={m} value={m.toString()}>{t.mat} {m}</option>)}
              </select>
            </div>
            <button onClick={() => generateBracket(selectedCategory)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-16 py-6 rounded-[2rem] font-black shadow-[0_20px_40px_rgba(79,70,229,0.3)] uppercase tracking-[0.2em] transition-all active:scale-95 text-sm">{t.generateBracket}</button>
          </div>
        </div>
        )
      ) : (
        <div className="space-y-16 animate-in fade-in duration-500">
          {podium && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 animate-in fade-in duration-500">
              <div className="flex items-center gap-4 mb-6">
                <div className="text-amber-500"><Icons.Trophy /></div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white">{t.categoryFinished}</h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                <PodiumSlot place="first" athleteId={podium.goldId} />
                <PodiumSlot place="second" athleteId={podium.silverId} />
                {podium.bronzeIds.map(id => <PodiumSlot key={id} place="third" athleteId={id} />)}
              </div>
            </div>
          )}
          {currentFormat === 'round_robin' ? (
            <div className="space-y-12">
              <div className="flex flex-wrap gap-6 justify-center">
                {currentMatches.map(m => (
                  <div key={m.id} className={`bg-slate-900/60 backdrop-blur-md border transition-all duration-300 shadow-xl relative rounded-[2.5rem] p-5 min-w-[280px] ${m.winnerId ? 'border-emerald-500/30' : 'border-slate-800/60'}`}>
                    <div className="space-y-4">
                      {[1, 2].map(idx => {
                        const athleteId = idx === 1 ? m.competitor1Id : m.competitor2Id;
                        const athlete = getAthlete(athleteId);
                        const isWinner = m.winnerId === athleteId;
                        const isLoser = m.winnerId && m.winnerId !== athleteId;
                        return (
                          <div key={idx} onClick={() => !readOnly && athlete && !m.winnerId && setFinishingMatch({ matchId: m.id, winnerId: athlete.id })} className={`flex flex-col p-3.5 rounded-2xl transition-all duration-300 ${athlete ? (m.winnerId || readOnly ? '' : 'cursor-pointer hover:bg-slate-800/80 active:scale-95') : 'bg-slate-950/40 border border-slate-800/40 border-dashed'} ${isWinner ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20' : ''} ${isLoser ? 'opacity-40 grayscale-[0.5]' : ''}`}>
                            <span className={`text-xs font-black truncate leading-tight tracking-wide ${athlete ? (isWinner ? 'text-emerald-400' : 'text-white') : 'text-slate-700 italic'}`}>{athlete ? athlete.name : '...'}</span>
                          </div>
                        );
                      })}
                    </div>
                    {!m.winnerId && m.competitor1Id && m.competitor2Id && !readOnly && (
                      <div className="mt-5 pt-4 border-t border-slate-800/50 flex justify-end px-1">
                        <button onClick={(e) => { e.stopPropagation(); onCallToMat?.(m.id, m.mat || selectedMat); }} className="print:hidden text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20 active:scale-95 transition-all">{t.callToMat}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {standings && (
                <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8">
                  <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white mb-6">{t.standingsTitle}</h3>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                        <th className="pb-3">{t.standingsPlace}</th>
                        <th className="pb-3">{t.standingsAthlete}</th>
                        <th className="pb-3 text-right">{t.standingsWins}</th>
                        <th className="pb-3 text-right">{t.standingsLosses}</th>
                        <th className="pb-3 text-right">{t.standingsDiff}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, i) => (
                        <tr key={row.id} className="border-t border-slate-800/60">
                          <td className="py-3 text-white font-black">{i + 1}</td>
                          <td className="py-3 text-white font-bold">{getAthlete(row.id)?.name ?? '...'}</td>
                          <td className="py-3 text-right text-emerald-400 font-black">{row.wins}</td>
                          <td className="py-3 text-right text-slate-500 font-black">{row.losses}</td>
                          <td className="py-3 text-right text-slate-400 font-black">{row.pointsFor - row.pointsAgainst > 0 ? '+' : ''}{row.pointsFor - row.pointsAgainst}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : currentFormat === 'double' ? (
            <div className="space-y-16">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white mb-4">{t.winnersBracketTitle}</h3>
                <BracketRounds matches={winnersMatches} getAthlete={getAthlete} t={t} readOnly={readOnly} onCallToMat={onCallToMat} setFinishingMatch={setFinishingMatch} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white mb-4">{t.losersBracketTitle}</h3>
                <BracketRounds matches={losersMatches} getAthlete={getAthlete} t={t} readOnly={readOnly} onCallToMat={onCallToMat} setFinishingMatch={setFinishingMatch} />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white mb-4">{t.grandFinalTitle}</h3>
                <BracketRounds matches={finalMatches} getAthlete={getAthlete} t={t} readOnly={readOnly} onCallToMat={onCallToMat} setFinishingMatch={setFinishingMatch} />
              </div>
            </div>
          ) : (
            <BracketRounds matches={currentMatches} getAthlete={getAthlete} t={t} readOnly={readOnly} onCallToMat={onCallToMat} setFinishingMatch={setFinishingMatch} />
          )}
        </div>
      )}

      {finishingMatch && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-lg rounded-[3.5rem] p-10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-3xl font-black mb-10 text-white tracking-tight text-center">{t.finishMatch}</h3>
            <div className="flex flex-col items-center mb-10 bg-emerald-500/10 p-6 rounded-[2rem] border border-emerald-500/20">
               <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-2">{t.winner.toUpperCase()}</span>
               <p className="text-2xl font-black text-white text-center leading-tight">{getAthlete(finishingMatch.winnerId)?.name}</p>
            </div>
            
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-3">
                {['Submission', 'Points', 'Advantages', 'Decision', 'Disqualification', 'Noshow'].map(method => (
                  <button key={method} onClick={() => setWinMethod(method)} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${winMethod === method ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{t[method.toLowerCase() + 'Win'] || method}</button>
                ))}
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">Comments</label>
                 <input value={winComment} onChange={e => setWinComment(e.target.value)} placeholder="RNC, 10-0, OT..." className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 outline-none font-black shadow-inner focus:border-indigo-500 transition-colors" />
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setFinishingMatch(null)} className="flex-1 py-5 bg-slate-800 text-slate-300 rounded-2xl font-black uppercase text-xs tracking-[0.2em] active:scale-95 transition-all">{t.cancel}</button>
              <button onClick={confirmWinner} className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-emerald-900/30 active:scale-95 transition-all">{t.finishMatch}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BracketView;
