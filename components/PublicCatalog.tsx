import React, { useEffect, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { publicApi, type PublicTournamentSummary } from '../services/api';

interface PublicCatalogProps {
  t: TranslationKeys;
}

// Athlete-facing home page (smoothcomp.com-style): browse published
// tournaments and pick one to register for, no login required. Organizer
// sign-in is a separate, deliberately less prominent entry point.
const PublicCatalog: React.FC<PublicCatalogProps> = ({ t }) => {
  const [tournaments, setTournaments] = useState<PublicTournamentSummary[] | null>(null);

  useEffect(() => {
    publicApi.getPublicTournaments().then(res => {
      if (res.ok === true) setTournaments(res.data);
      else setTournaments([]);
    });
  }, []);

  return (
    <div className="min-h-screen bjj-gradient p-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">{t.publicCatalogTitle}</h1>
            <p className="text-slate-500 text-sm mt-1">{t.publicCatalogSub}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <a href="?login=true" className="text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest">
              {t.organizerLoginLink}
            </a>
            <a href="?cabinet=true" className="text-[10px] font-black text-indigo-400 hover:text-white uppercase tracking-widest">
              {t.cabinetLink}
            </a>
          </div>
        </div>

        {tournaments === null && (
          <p className="text-center text-slate-500 text-sm py-12">…</p>
        )}

        {tournaments !== null && tournaments.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-12">{t.publicCatalogEmpty}</p>
        )}

        {tournaments !== null && tournaments.length > 0 && (
          <div className="space-y-4">
            {tournaments.map(tour => (
              <div key={tour.id} className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 flex items-center justify-between gap-4 shadow-2xl">
                <div className="min-w-0">
                  <h3 className="text-white font-black truncate">{tour.name}</h3>
                  <p className="text-slate-500 text-xs mt-1 truncate">
                    {[tour.eventDate, tour.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <a
                    href={`?live=true&t=${tour.slug}`}
                    className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    {t.viewLiveLink}
                  </a>
                  <a
                    href={`?register=true&t=${tour.slug}`}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all active:scale-95"
                  >
                    {t.registerForTournament}
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicCatalog;
