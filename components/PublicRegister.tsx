
import React, { useMemo, useState } from 'react';
import { AgeGroup, BeltColor, Competitor } from '../types';
import type { TranslationKeys } from '../translations';
import { publicApi } from '../services/api';

interface PublicRegisterProps {
  t: TranslationKeys;
  slug: string;
}

const PublicRegister: React.FC<PublicRegisterProps> = ({ t, slug }) => {
  const [form, setForm] = useState<Partial<Competitor>>({
    name: '', belt: 'White', weight: '', team: '', isAbsolute: false, ageGroup: 'Adult'
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFormValid = useMemo(() => {
    const weightVal = parseFloat(form.weight?.toString().replace(',', '.') || '0');
    return (form.name?.trim()?.length || 0) > 2 && !isNaN(weightVal) && weightVal > 0;
  }, [form]);

  const reset = () => {
    setForm({ name: '', belt: 'White', weight: '', team: '', isAbsolute: false, ageGroup: 'Adult' });
    setSubmitted(false);
    setError(null);
  };

  const submit = async () => {
    if (!isFormValid || submitting || !slug) return;
    setSubmitting(true);
    setError(null);

    const weight = parseFloat(form.weight?.toString().replace(',', '.') || '0');
    const competitor: Competitor = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      name: (form.name ?? '').trim(),
      belt: (form.belt as BeltColor) || 'White',
      weight: weight.toString(),
      team: (form.team || 'Independent').trim(),
      ageGroup: form.ageGroup || 'Adult',
      isAbsolute: form.isAbsolute || false,
    };

    const result = await publicApi.submitRegistration(slug, competitor);
    setSubmitting(false);
    if (result.ok === true) {
      setSubmitted(true);
    } else {
      setError(result.error);
    }
  };

  if (submitted) {
    return (
      <div className="h-screen flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-emerald-500/30 rounded-[3rem] p-12 max-w-lg w-full text-center shadow-2xl">
          <div className="text-emerald-500 text-5xl mb-6">✓</div>
          <h2 className="text-2xl font-black text-white mb-3">{t.registerSuccessTitle}</h2>
          <p className="text-slate-400 mb-8">{t.registerSuccessBody}</p>
          <button onClick={reset} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95">
            {t.registerAnother}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 py-12">
      <div className="bg-slate-900 border border-slate-800/80 w-full max-w-xl rounded-[3rem] p-10 shadow-2xl">
        <h1 className="text-2xl font-black mb-2 text-white tracking-tight uppercase">{t.publicRegisterTitle}</h1>
        <p className="text-slate-500 text-sm mb-10">{t.publicRegisterSub}</p>

        <div className="space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.fullName}</label>
            <input placeholder="Иван Иванов" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 transition-colors shadow-inner text-sm" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.ageGroup}</label>
              <select value={form.ageGroup} onChange={e => setForm({ ...form, ageGroup: e.target.value as AgeGroup, belt: 'White' })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                <option value="Adult">{t.adult}</option>
                <option value="Kid">{t.kid}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.belt}</label>
              <select value={form.belt} onChange={e => setForm({ ...form, belt: e.target.value as BeltColor })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer shadow-inner text-sm">
                {(form.ageGroup === 'Adult' ? ['White', 'Blue', 'Purple', 'Brown', 'Black'] : ['White', 'Grey', 'Yellow', 'Orange', 'Green']).map(b => (
                  <option key={b} value={b}>{t.belts[b as BeltColor]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.weight}</label>
              <input type="text" placeholder="88.3" value={form.weight} onChange={e => {
                const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                setForm({ ...form, weight: val });
              }} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 shadow-inner text-sm" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.absoluteShort}</label>
              <button onClick={() => setForm({ ...form, isAbsolute: !form.isAbsolute })} className={`w-full p-5 rounded-2xl border font-black transition-all active:scale-95 shadow-inner text-xs tracking-widest ${form.isAbsolute ? 'bg-amber-500 border-amber-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>
                {form.isAbsolute ? 'ACTIVE' : 'DISABLED'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.team}</label>
            <input placeholder="Академия Джиу-Джитсу" value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 shadow-inner transition-colors text-sm" />
          </div>
        </div>

        {error && <p className="mt-6 text-red-500 text-xs font-bold text-center">{error}</p>}

        <button
          disabled={!isFormValid || submitting}
          onClick={submit}
          className={`w-full mt-10 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all ${isFormValid && !submitting ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 grayscale'}`}
        >
          {t.registerSubmit}
        </button>
      </div>
    </div>
  );
};

export default PublicRegister;
