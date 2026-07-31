import React, { useEffect, useMemo, useState } from 'react';
import { AgeGroup, Competitor, WeightCategory, getWeightCategoryKey } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { api } from '../services/api';

interface WeightCategoriesSettingsProps {
  weightCategories: WeightCategory[];
  setWeightCategories: React.Dispatch<React.SetStateAction<WeightCategory[]>>;
  competitors: Competitor[];
  t: TranslationKeys;
}

const AGE_GROUPS: AgeGroup[] = ['Adult', 'Kid'];

// The "no limit" (heaviest) category per age group is never a toggle the
// organizer flips — it's structurally whichever row has maxWeight: null,
// which the draft always has exactly one of per age group (seeded that way,
// and "add category" only ever creates numeric rows; the null row itself
// can't be deleted). This keeps the "exactly one open-ended category"
// invariant enforced by the UI shape itself, not by extra validation.
const WeightCategoriesSettings: React.FC<WeightCategoriesSettingsProps> = ({ weightCategories, setWeightCategories, competitors, t }) => {
  const [draft, setDraft] = useState<WeightCategory[]>(weightCategories);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(weightCategories);
  }, [weightCategories, dirty]);

  const rowsByAge = useMemo(() => {
    const result: Record<AgeGroup, { numeric: WeightCategory[]; unlimited: WeightCategory | undefined }> = {
      Adult: { numeric: [], unlimited: undefined },
      Kid: { numeric: [], unlimited: undefined },
    };
    for (const group of AGE_GROUPS) {
      const forAge = draft.filter(c => c.ageGroup === group);
      result[group].numeric = forAge.filter(c => c.maxWeight !== null).sort((a, b) => (a.maxWeight as number) - (b.maxWeight as number));
      result[group].unlimited = forAge.find(c => c.maxWeight === null);
    }
    return result;
  }, [draft]);

  const athleteCount = (categoryId: string, ageGroup: AgeGroup) =>
    competitors.filter(c => c.ageGroup === ageGroup && getWeightCategoryKey(c.weight, c.ageGroup, weightCategories) === categoryId).length;

  const updateRow = (id: string, patch: Partial<WeightCategory>) => {
    setDraft(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    setDirty(true);
  };

  const removeRow = (id: string) => {
    setDraft(prev => prev.filter(c => c.id !== id));
    setDirty(true);
  };

  const addRow = (ageGroup: AgeGroup) => {
    const numeric = rowsByAge[ageGroup].numeric;
    const highest = numeric.length > 0 ? Math.max(...numeric.map(c => c.maxWeight as number)) : 45;
    setDraft(prev => [...prev, { id: crypto.randomUUID(), ageGroup, name: '', maxWeight: highest + 5 }]);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await api.updateWeightCategories(draft);
    setSaving(false);
    if (res.ok === true) {
      setWeightCategories(res.data);
      setDirty(false);
    } else {
      alert(t.adminTokenInvalid);
    }
  };

  return (
    <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
      <h3 className="text-sm font-black uppercase text-indigo-400 mb-2 tracking-widest flex items-center gap-2">
        <Icons.Trophy /> {t.weightCategoriesTitle}
      </h3>
      <p className="text-[10px] text-slate-500 mb-6">{t.weightCategoriesSub}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {AGE_GROUPS.map(ageGroup => (
          <div key={ageGroup} className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">{ageGroup === 'Adult' ? t.adult : t.kid}</h4>

            {rowsByAge[ageGroup].numeric.map(row => {
              const count = athleteCount(row.id, ageGroup);
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
                    value={row.maxWeight ?? ''}
                    onChange={e => updateRow(row.id, { maxWeight: parseFloat(e.target.value) || 0 })}
                    title={t.maxWeightLabel}
                    className="w-20 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs font-black text-center outline-none focus:border-indigo-500"
                  />
                  <span className="text-[9px] text-slate-600 font-black uppercase shrink-0">kg</span>
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

            {rowsByAge[ageGroup].unlimited && (
              <div className="flex items-center gap-2 bg-slate-950 border border-amber-500/20 rounded-xl p-3">
                <input
                  value={rowsByAge[ageGroup].unlimited!.name}
                  onChange={e => updateRow(rowsByAge[ageGroup].unlimited!.id, { name: e.target.value })}
                  placeholder={t.categoryName}
                  maxLength={60}
                  className="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none placeholder:text-slate-700"
                />
                <span className="text-[9px] text-amber-500 font-black uppercase tracking-widest shrink-0">{t.noLimitLabel}</span>
              </div>
            )}

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
        {t.saveWeightCategories}
      </button>
    </section>
  );
};

export default WeightCategoriesSettings;
