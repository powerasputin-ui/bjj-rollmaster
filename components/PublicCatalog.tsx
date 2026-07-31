import React, { useEffect, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { publicApi, type PublicTournamentSummary } from '../services/api';
import LiquidBackground from './LiquidBackground';

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
    <div className="relative min-h-screen bg-[#121212] overflow-hidden">
      <LiquidBackground />
      <div className="relative z-10 max-w-2xl mx-auto p-6 py-16">
        <div className="flex items-center justify-between mb-10 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white">{t.publicCatalogTitle}</h1>
            <p className="text-gray-400 text-sm mt-1">{t.publicCatalogSub}</p>
          </div>
          <a href="?login=true" className="text-xs font-medium text-gray-400 hover:text-white shrink-0 underline">
            {t.organizerLoginLink}
          </a>
        </div>

        {tournaments === null && (
          <p className="text-center text-gray-500 text-sm py-12">…</p>
        )}

        {tournaments !== null && tournaments.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-12">{t.publicCatalogEmpty}</p>
        )}

        {tournaments !== null && tournaments.length > 0 && (
          <div className="space-y-4">
            {tournaments.map(tour => (
              <div key={tour.id} className="rounded-2xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm border border-white/10 p-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-white font-semibold truncate">{tour.name}</h3>
                  <p className="text-gray-400 text-xs mt-1 truncate">
                    {[tour.eventDate, tour.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <a
                  href={`?register=true&t=${tour.slug}`}
                  className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-5 py-3 rounded-full transition"
                >
                  {t.registerForTournament}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicCatalog;
