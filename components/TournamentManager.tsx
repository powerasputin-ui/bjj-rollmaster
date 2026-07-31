
import React, { useState, useMemo, useEffect } from 'react';
import { Competitor, BeltColor, AgeGroup, AgeCategory, SparringFormat, WeightCategory, getWeightCategoryKey, orderedCategoryIds, BELT_RANK, Match } from '../types';
import type { TranslationKeys } from '../translations';
import { BELT_COLORS, Icons } from '../constants';
import { api } from '../services/api';

export interface RosterFilterRequest {
  belt: BeltColor;
  ageGroup: AgeGroup;
}

interface TournamentProps {
  competitors: Competitor[];
  setCompetitors: React.Dispatch<React.SetStateAction<Competitor[]>>;
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  weightCategories: WeightCategory[];
  ageCategories?: AgeCategory[];
  t: TranslationKeys;
  filterRequest?: RosterFilterRequest | null;
  onFilterRequestApplied?: () => void;
  sparringFormat?: SparringFormat;
}

const TournamentManager: React.FC<TournamentProps> = ({ competitors, setCompetitors, matches: _matches, setMatches, weightCategories, ageCategories = [], t, filterRequest, onFilterRequestApplied, sparringFormat = 'gi' }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>('Adult');
  const [selectedBelt, setSelectedBelt] = useState<BeltColor | 'Absolute' | 'All'>('All');
  const [selectedWeight, setSelectedWeight] = useState<string>('All');
  const [selectedWeightCheck, setSelectedWeightCheck] = useState<'All' | 'Made' | 'NotMade'>('All');
  const [selectedSparringFilter, setSelectedSparringFilter] = useState<'All' | 'gi' | 'nogi'>('All');

  // Jumping in from the Dashboard's belt chart pre-applies that belt/age filter.
  useEffect(() => {
    if (!filterRequest) return;
    setSelectedAgeGroup(filterRequest.ageGroup);
    setSelectedBelt(filterRequest.belt);
    setSelectedWeight('All');
    setSearchTerm('');
    onFilterRequestApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRequest]);
  
  const [movingCompetitor, setMovingCompetitor] = useState<Competitor | null>(null);
  const [moveForm, setMoveForm] = useState<{ ageGroup: AgeGroup; belt: BeltColor; weight: string; ageCategoryId: string | null }>({ ageGroup: 'Adult', belt: 'White', weight: '', ageCategoryId: null });
  const [moveSaving, setMoveSaving] = useState(false);

  const startMove = (c: Competitor) => {
    setMovingCompetitor(c);
    setMoveForm({ ageGroup: c.ageGroup, belt: c.belt, weight: c.weight, ageCategoryId: c.ageCategoryId ?? null });
  };

  const saveMove = async () => {
    if (!movingCompetitor || moveSaving) return;
    setMoveSaving(true);
    const id = movingCompetitor.id;
    const patch = { ageGroup: moveForm.ageGroup, belt: moveForm.belt, weight: moveForm.weight, ageCategoryId: moveForm.ageCategoryId };
    setCompetitors(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    const res = await api.patchCompetitor(id, patch);
    setMoveSaving(false);
    setMovingCompetitor(null);
    if (res.ok === false) alert(t.adminTokenInvalid);
  };

  const [newComp, setNewComp] = useState<Partial<Competitor>>({
    name: '', belt: 'White', weight: '', team: '', isAbsolute: false, ageGroup: 'Adult', competesGi: true, competesNoGi: false, ageCategoryId: null
  });

  const isFormValid = useMemo(() => {
    const weightVal = parseFloat(newComp.weight?.toString().replace(',', '.') || '0');
    const formatValid = sparringFormat !== 'both' || newComp.competesGi || newComp.competesNoGi;
    return (newComp.name?.trim()?.length || 0) > 2 && !isNaN(weightVal) && weightVal > 0 && formatValid;
  }, [newComp, sparringFormat]);

  const addCompetitor = () => {
    if (!isFormValid) return;

    const weight = parseFloat(newComp.weight?.toString().replace(',', '.') || '0');
    const competitor: Competitor = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      name: (newComp.name ?? '').trim(),
      belt: (newComp.belt as BeltColor) || 'White',
      weight: weight.toString(),
      team: (newComp.team || 'Independent').trim(),
      ageGroup: newComp.ageGroup || 'Adult',
      isAbsolute: newComp.isAbsolute || false,
      madeWeight: false,
      competesGi: sparringFormat === 'nogi' ? false : (sparringFormat === 'both' ? !!newComp.competesGi : true),
      competesNoGi: sparringFormat === 'gi' ? false : (sparringFormat === 'both' ? !!newComp.competesNoGi : true),
      ageCategoryId: newComp.ageCategoryId ?? null,
    };
    setCompetitors(prev => [...prev, competitor]);
    setNewComp({ name: '', belt: 'White', weight: '', team: '', isAbsolute: false, ageGroup: 'Adult', competesGi: true, competesNoGi: false, ageCategoryId: null });
    setShowAddModal(false);
    api.createCompetitor(competitor).then(res => {
      if (res.ok === false) {
        alert(t.adminTokenInvalid);
        setCompetitors(prev => prev.filter(c => c.id !== competitor.id));
      }
    });
  };

  const removeCompetitor = (id: string) => {
    if (confirm(t.removeAthleteConfirm ?? t.resetDesc)) {
      setCompetitors(prev => prev.filter(c => c.id !== id));
      setMatches(prev => prev.filter(m => m.competitor1Id !== id && m.competitor2Id !== id));
      api.deleteCompetitor(id).then(res => {
        if (res.ok === false) alert(t.adminTokenInvalid);
      });
    }
  };

  const toggleWeightCheck = (id: string) => {
    const next = !competitors.find(c => c.id === id)?.madeWeight;
    setCompetitors(prev => prev.map(c => c.id === id ? { ...c, madeWeight: next } : c));
    api.patchCompetitor(id, { madeWeight: next }).then(res => {
      if (res.ok === false) alert(t.adminTokenInvalid);
    });
  };

  const filteredCompetitors = useMemo(() => {
    return competitors.filter(c => {
      const s = searchTerm.toLowerCase();
      const matchesSearch = c.name.toLowerCase().includes(s) || c.team.toLowerCase().includes(s);
      const matchesAge = c.ageGroup === selectedAgeGroup;
      const matchesBelt = selectedBelt === 'All' || (selectedBelt === 'Absolute' ? !!c.isAbsolute : c.belt === selectedBelt);
      const cat = getWeightCategoryKey(c.weight, c.ageGroup, weightCategories);
      const matchesWeight = selectedWeight === 'All' || (selectedWeight === 'absolute' ? !!c.isAbsolute : cat === selectedWeight);
      const matchesWeightCheck = selectedWeightCheck === 'All' || (selectedWeightCheck === 'Made' ? !!c.madeWeight : !c.madeWeight);
      const matchesSparring = selectedSparringFilter === 'All' || (selectedSparringFilter === 'gi' ? c.competesGi !== false : !!c.competesNoGi);
      return matchesSearch && matchesAge && matchesBelt && matchesWeight && matchesWeightCheck && matchesSparring;
    });
  }, [competitors, searchTerm, selectedAgeGroup, selectedBelt, selectedWeight, selectedWeightCheck, selectedSparringFilter, weightCategories]);

  const groupedCompetitors = useMemo(() => {
    const groups: Record<string, Competitor[]> = {};
    filteredCompetitors.forEach(c => {
      const cat = getWeightCategoryKey(c.weight, c.ageGroup, weightCategories);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
      if (c.isAbsolute && selectedWeight === 'All') {
        if (!groups['absolute']) groups['absolute'] = [];
        groups['absolute'].push(c);
      }
    });

    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => (BELT_RANK[b.belt] || 0) - (BELT_RANK[a.belt] || 0));
    });

    return groups;
  }, [filteredCompetitors, selectedWeight, weightCategories]);

  const sortedCategories = useMemo(() => {
    const ordered = orderedCategoryIds(weightCategories, selectedAgeGroup);
    const rank = (key: string) => {
      if (key === 'absolute') return 100;
      const idx = ordered.indexOf(key);
      return idx === -1 ? 999 : idx;
    };
    return Object.keys(groupedCompetitors).sort((a, b) => rank(a) - rank(b));
  }, [groupedCompetitors, weightCategories, selectedAgeGroup]);

  const weightOptions = ['All', ...orderedCategoryIds(weightCategories, selectedAgeGroup), 'absolute'];

  const beltOptions = selectedAgeGroup === 'Adult' 
    ? ['All', 'White', 'Blue', 'Purple', 'Brown', 'Black', 'Absolute']
    : ['All', 'White', 'Grey', 'Yellow', 'Orange', 'Green', 'Absolute'];

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-10 gap-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-white mb-2 uppercase">{t.roster}</h2>
          <p className="text-slate-500 font-medium text-sm">{t.rosterSub}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-[1.5rem] font-black shadow-lg transition-all flex items-center gap-3 active:scale-95 uppercase tracking-widest text-xs">
          <Icons.Users /> {t.registerAthlete}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-12 p-8 bg-slate-900/40 backdrop-blur-md rounded-[2.5rem] border border-slate-800/60 shadow-xl">
        <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 md:col-span-3 lg:col-span-2 shadow-inner">
          {(['Adult', 'Kid'] as AgeGroup[]).map(group => (
            <button key={group} onClick={() => { setSelectedAgeGroup(group); setSelectedBelt('All'); setSelectedWeight('All'); setSelectedWeightCheck('All'); setSelectedSparringFilter('All'); }} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${selectedAgeGroup === group ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
              {group === 'Adult' ? t.adult : t.kid}
            </button>
          ))}
        </div>
        <div className="md:col-span-9 lg:col-span-4 relative">
          <input type="text" placeholder={t.searchPlaceholder} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full h-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-slate-300 outline-none focus:border-indigo-500 transition-all font-bold placeholder:text-slate-700 text-sm shadow-inner"/>
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700">🔍</div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 md:col-span-12 lg:col-span-6">
          <select value={selectedWeight} onChange={(e) => setSelectedWeight(e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-2xl px-5 py-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 cursor-pointer shadow-inner">
            {weightOptions.map(opt => {
              const label = opt === 'All' ? t.allCategories : opt === 'absolute' ? t.openWeightLabel : weightCategories.find(c => c.id === opt)?.name || opt;
              return <option key={opt} value={opt}>{label}</option>;
            })}
          </select>
          <select value={selectedBelt} onChange={(e) => setSelectedBelt(e.target.value as BeltColor | 'Absolute' | 'All')} className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-2xl px-5 py-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 cursor-pointer shadow-inner">
            {beltOptions.map(opt => <option key={opt} value={opt}>{opt === 'All' ? t.allBelts : t.belts[opt as BeltColor] || opt}</option>)}
          </select>
          <select value={selectedWeightCheck} onChange={(e) => setSelectedWeightCheck(e.target.value as 'All' | 'Made' | 'NotMade')} className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-2xl px-5 py-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 cursor-pointer shadow-inner">
            <option value="All">{t.weightCheckFilterAll}</option>
            <option value="Made">{t.weightCheckFilterMade}</option>
            <option value="NotMade">{t.weightCheckFilterNotMade}</option>
          </select>
          {sparringFormat === 'both' && (
            <select value={selectedSparringFilter} onChange={(e) => setSelectedSparringFilter(e.target.value as 'All' | 'gi' | 'nogi')} className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-2xl px-5 py-4 text-[11px] font-black uppercase tracking-widest outline-none focus:border-indigo-500 cursor-pointer shadow-inner">
              <option value="All">{t.allCategories}</option>
              <option value="gi">{t.sparringFormatGi}</option>
              <option value="nogi">{t.sparringFormatNoGi}</option>
            </select>
          )}
        </div>
      </div>

      <div className="space-y-16">
        {sortedCategories.map(catKey => {
          const group = groupedCompetitors[catKey];
          const isAbs = catKey === 'absolute';
          const categoryLabel = isAbs ? t.openWeightLabel : catKey === 'unknown' ? t.uncategorized : weightCategories.find(c => c.id === catKey)?.name || catKey;
          return (
            <div key={catKey} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-6 mb-8">
                <div className={`w-2 h-8 rounded-full ${isAbs ? 'bg-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-indigo-500 shadow-[0_0_20px_rgba(79,70,229,0.5)]'}`}></div>
                <h3 className={`text-lg font-black uppercase tracking-[0.2em] ${isAbs ? 'text-amber-500' : 'text-white'}`}>{categoryLabel}</h3>
                <div className="h-px flex-1 bg-slate-800/40"></div>
                {group.length === 1 && (
                  <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">{t.aloneInCategory}</span>
                )}
                <span className="text-[10px] font-black text-slate-600 tracking-widest uppercase">{group.length} {t.totalAthletes}</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {group.map((c) => (
                  <div key={c.id} className={`bg-slate-900/60 border rounded-[2rem] p-6 hover:border-indigo-500/50 transition-all group backdrop-blur-md relative overflow-hidden shadow-lg ${isAbs ? 'border-amber-500/20' : 'border-slate-800/60'}`}>
                    <div className="flex items-start justify-between mb-6">
                      <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm ${BELT_COLORS[c.belt]}`}>{t.belts[c.belt]}</div>
                      <div className="flex gap-2">
                         <button onClick={() => toggleWeightCheck(c.id)} className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${c.madeWeight ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>
                           {t.weightCheck}
                         </button>
                         <button onClick={() => startMove(c)} className="px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-800 bg-slate-950 text-slate-600 hover:text-white hover:border-indigo-500/40 transition-all">
                           {t.moveCategoryButton}
                         </button>
                         <button onClick={() => removeCompetitor(c.id)} className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center hover:bg-red-500 hover:text-white">✕</button>
                      </div>
                    </div>
                    <h4 className="text-lg font-black text-white truncate mb-1 leading-tight">{c.name}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase truncate tracking-wide">{c.team}</p>
                    {sparringFormat === 'both' && (
                      <div className="flex gap-1.5 mt-3">
                        {c.competesGi !== false && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{t.sparringFormatGi}</span>}
                        {c.competesNoGi && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">{t.sparringFormatNoGi}</span>}
                      </div>
                    )}
                    <div className="mt-8 pt-5 border-t border-slate-800/50 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800 uppercase">{c.weight} KG</span>
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t[c.ageGroup.toLowerCase()]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {sortedCategories.length === 0 && (
          <div className="py-40 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/60">
             <div className="text-slate-800 mb-6 flex justify-center scale-150"><Icons.Users /></div>
             <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.noAthletes}</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-xl rounded-[3rem] p-10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-2xl font-black mb-10 text-white tracking-tight uppercase">{t.athleteReg}</h3>
            <div className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.fullName}</label>
                <input placeholder="Иван Иванов" value={newComp.name} onChange={e => setNewComp({...newComp, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 transition-colors shadow-inner text-sm"/>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.ageGroup}</label>
                  <select value={newComp.ageGroup} onChange={e => setNewComp({...newComp, ageGroup: e.target.value as AgeGroup, belt: 'White', ageCategoryId: null})} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                    <option value="Adult">{t.adult}</option>
                    <option value="Kid">{t.kid}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.belt}</label>
                  <select value={newComp.belt} onChange={e => setNewComp({...newComp, belt: e.target.value as BeltColor})} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                    {(newComp.ageGroup === 'Adult' ? ['White', 'Blue', 'Purple', 'Brown', 'Black'] : ['White', 'Grey', 'Yellow', 'Orange', 'Green']).map(b => (
                      <option key={b} value={b}>{t.belts[b as BeltColor]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {ageCategories.some(c => c.ageGroup === newComp.ageGroup) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.ageCategoryLabel}</label>
                  <select
                    value={newComp.ageCategoryId ?? ''}
                    onChange={e => setNewComp({ ...newComp, ageCategoryId: e.target.value || null })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm"
                  >
                    <option value="">—</option>
                    {ageCategories.filter(c => c.ageGroup === newComp.ageGroup).sort((a, b) => a.sortOrder - b.sortOrder).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.weight}</label>
                  <input type="text" placeholder="88.3" value={newComp.weight} onChange={e => {
                      const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                      setNewComp({...newComp, weight: val});
                  }} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 shadow-inner text-sm"/>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.absoluteShort}</label>
                   <button onClick={() => setNewComp({...newComp, isAbsolute: !newComp.isAbsolute})} className={`w-full p-5 rounded-2xl border font-black transition-all active:scale-95 shadow-inner text-xs tracking-widest ${newComp.isAbsolute ? 'bg-amber-500 border-amber-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>
                     {newComp.isAbsolute ? 'ACTIVE' : 'DISABLED'}
                   </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.team}</label>
                <input placeholder="Академия Джиу-Джитсу" value={newComp.team} onChange={e => setNewComp({...newComp, team: e.target.value})} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 shadow-inner transition-colors text-sm"/>
              </div>

              {sparringFormat === 'both' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.sparringFormatLabel}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setNewComp({...newComp, competesGi: !newComp.competesGi})} className={`p-5 rounded-2xl border font-black transition-all active:scale-95 shadow-inner text-xs tracking-widest uppercase ${newComp.competesGi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>
                      {t.competesGiLabel}
                    </button>
                    <button type="button" onClick={() => setNewComp({...newComp, competesNoGi: !newComp.competesNoGi})} className={`p-5 rounded-2xl border font-black transition-all active:scale-95 shadow-inner text-xs tracking-widest uppercase ${newComp.competesNoGi ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>
                      {t.competesNoGiLabel}
                    </button>
                  </div>
                  {!newComp.competesGi && !newComp.competesNoGi && (
                    <p className="text-[11px] text-rose-400 ml-4">{t.mustPickFormatError}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-5 bg-slate-800 text-slate-300 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-slate-700 transition-all active:scale-95">{t.cancel}</button>
              <button 
                disabled={!isFormValid}
                onClick={addCompetitor} 
                className={`flex-1 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all ${isFormValid ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 grayscale'}`}
              >
                {t.register}
              </button>
            </div>
          </div>
        </div>
      )}

      {movingCompetitor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-xl rounded-[3rem] p-10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-2xl font-black mb-2 text-white tracking-tight uppercase">{t.moveCategoryTitle}</h3>
            <p className="text-slate-500 text-sm mb-10">{movingCompetitor.name}</p>
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.ageGroup}</label>
                  <select value={moveForm.ageGroup} onChange={e => {
                    const nextAge = e.target.value as AgeGroup;
                    const nextBelts = nextAge === 'Adult' ? ['White', 'Blue', 'Purple', 'Brown', 'Black'] : ['White', 'Grey', 'Yellow', 'Orange', 'Green'];
                    setMoveForm({ ...moveForm, ageGroup: nextAge, belt: nextBelts.includes(moveForm.belt) ? moveForm.belt : nextBelts[0] as BeltColor, ageCategoryId: null });
                  }} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                    <option value="Adult">{t.adult}</option>
                    <option value="Kid">{t.kid}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.belt}</label>
                  <select value={moveForm.belt} onChange={e => setMoveForm({ ...moveForm, belt: e.target.value as BeltColor })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                    {(moveForm.ageGroup === 'Adult' ? ['White', 'Blue', 'Purple', 'Brown', 'Black'] : ['White', 'Grey', 'Yellow', 'Orange', 'Green']).map(b => (
                      <option key={b} value={b}>{t.belts[b as BeltColor]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.weight}</label>
                <input type="text" placeholder="88.3" value={moveForm.weight} onChange={e => {
                  const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                  setMoveForm({ ...moveForm, weight: val });
                }} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 shadow-inner text-sm"/>
              </div>
              {ageCategories.some(c => c.ageGroup === moveForm.ageGroup) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.ageCategoryLabel}</label>
                  <select
                    value={moveForm.ageCategoryId ?? ''}
                    onChange={e => setMoveForm({ ...moveForm, ageCategoryId: e.target.value || null })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm"
                  >
                    <option value="">—</option>
                    {ageCategories.filter(c => c.ageGroup === moveForm.ageGroup).sort((a, b) => a.sortOrder - b.sortOrder).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setMovingCompetitor(null)} className="flex-1 py-5 bg-slate-800 text-slate-300 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-slate-700 transition-all active:scale-95">{t.cancel}</button>
              <button
                disabled={moveSaving}
                onClick={saveMove}
                className="flex-1 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
              >
                {t.moveCategoryButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentManager;
