import React, { useEffect, useMemo, useState } from 'react';
import { AgeCategory, AgeGroup, Competitor } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { api } from '../services/api';

interface AgeCategoriesSettingsProps {
  ageCategories: AgeCategory[];
  setAgeCategories: React.Dispatch<React.SetStateAction<AgeCategory[]>>;
  competitors: Competitor[];
  t: TranslationKeys;
}

const AGE_GROUPS: AgeGroup[] = ['Adult', 'Kid'];

const AgeCategoriesSettings: React.FC<AgeCategoriesSettingsProps> = ({ ageCategories, setAgeCategories, competitors, t }) => {
  const [draft, setDraft] = useState<AgeCategory[]>(ageCategories);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(ageCategories);
  }, [ageCategories, dirty]);

  const rowsByAge = useMemo(() => {
    const result: Record<AgeGroup, AgeCategory[]> = { Adult: [], Kid: [] };
    for (const group of AGE_GROUPS) {
      result[group] = draft.filter(c => c.ageGroup === group).sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return result;
  }, [draft]);

  const athleteCount = (categoryId: string) => competitors.filter(c => c.ageCategoryId === categoryId).length;

  const updateRow = (id: string, patch: Partial<AgeCategory>) => {
    setDraft(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  };

  const removeRow = (id: string) => {
    setDraft(prev => prev.filter(c => c.id !== id));
    setDirty(true);
  };

  const addRow = (ageGroup: AgeGroup) => {
    const forAge = rowsByAge[ageGroup];
    const nextOrder = forAge.length > 0 ? Math.max(...forAge.map(c => c.sortOrder)) + 1 : 0;
    setDraft(prev => [...prev, { id: crypto.randomUUID(), ageGroup, name: '', sortOrder: nextOrder }]);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await api.updateAgeCategories(draft);
    setSaving(false);
    if (res.ok === true) {
      setAgeCategories(res.data);
      setDirty(false);
    } else {
      alert(t.adminTokenInvalid);
    }
  };

  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
      <h3 className="text-sm font-black uppercase text-indigo-400 mb-2 tracking-widest flex items-center gap-2">
        <Icons.Trophy /> {t.ageCategoriesTitle}
      </h3>
      <p className="text-[10px] text-slate-500 mb-6">{t.ageCategoriesSub}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {AGE_GROUPS.map(ageGroup => (
          <div key={ageGroup} className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">{ageGroup === 'Adult' ? t.adult : t.kid}</h4>

            {rowsByAge[ageGroup].map(row => {
              const count = athleteCount(row.id);
              return (
                <div key={row.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <input
                    value={row.name}
                    onChange={e => updateRow(row.id, { name: e.target.value })}
                    placeholder={t.categoryName}
                    maxLength={60}
                    className="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none placeholder:text-slate-700"
                  />
                  <input
                    type="number"
                    value={row.sortOrder}
                    onChange={e => updateRow(row.id, { sortOrder: parseInt(e.target.value, 10) || 0 })}
                    title={t.sortOrderLabel}
                    className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-black text-center outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => removeRow(row.id)}
                    title={count > 0 ? `${count} ${t.athletesInCategory}` : undefined}
                    className="relative w-7 h-7 shrink-0 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs"
                  >
                    ✕
                    {count > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-slate-950 text-[8px] font-black rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                        {count}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => addRow(ageGroup)}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-slate-500 hover:text-white hover:border-indigo-500 text-[10px] font-black uppercase tracking-widest transition-all"
            >
              + {t.addCategory}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={!dirty || saving}
        className={`mt-8 px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 ${dirty && !saving ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'}`}
      >
        {t.saveAgeCategories}
      </button>
    </section>
  );
};

export default AgeCategoriesSettings;
