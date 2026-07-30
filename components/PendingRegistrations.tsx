
import React from 'react';
import { Competitor } from '../types';
import type { TranslationKeys } from '../translations';
import { BELT_COLORS } from '../constants';

interface PendingRegistrationsProps {
  t: TranslationKeys;
  pending: Competitor[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const PendingRegistrations: React.FC<PendingRegistrationsProps> = ({ t, pending, onApprove, onReject }) => {
  return (
    <div className="p-6 md:p-10 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="mb-10">
        <h2 className="text-3xl font-black tracking-tight text-white mb-2 uppercase">{t.pendingRegistrations}</h2>
        <p className="text-slate-500 font-medium text-sm">{t.pendingRegistrationsSub}</p>
      </div>

      {pending.length === 0 ? (
        <div className="py-32 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/60">
          <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.noRegistrations}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map(c => (
            <div key={c.id} className="bg-slate-900/60 border border-slate-800/60 rounded-[2rem] p-6 flex items-center justify-between gap-6 backdrop-blur-md">
              <div className="flex items-center gap-4 min-w-0">
                <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm shrink-0 ${BELT_COLORS[c.belt]}`}>{t.belts[c.belt]}</div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white truncate">{c.name}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase truncate mt-0.5">{c.team} · {c.weight} KG · {t[c.ageGroup.toLowerCase() as 'adult' | 'kid']}</p>
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => onReject(c.id)} className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all active:scale-95">{t.rejectAction}</button>
                <button onClick={() => onApprove(c.id)} className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500 transition-all active:scale-95">{t.approveAction}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingRegistrations;
