import React, { useEffect, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { api, type TournamentInfo } from '../services/api';
import LiquidBackground from './LiquidBackground';

interface TournamentsHubProps {
  t: TranslationKeys;
  onOpenTournament: (token: string, tournament: TournamentInfo) => void;
  onLogout: () => void;
}

const TournamentsHub: React.FC<TournamentsHubProps> = ({ t, onOpenTournament, onLogout }) => {
  const [tournaments, setTournaments] = useState<TournamentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    api.listTournaments().then(res => {
      if (res.ok === true) {
        setTournaments(res.data);
        setShowCreate(res.data.length === 0);
      } else {
        setError(res.error);
      }
    });
  }, []);

  const openTournament = async (id: string) => {
    setOpeningId(id);
    setError(null);
    const res = await api.selectTournament(id);
    setOpeningId(null);
    if (res.ok === true) onOpenTournament(res.data.token, res.data.tournament);
    else setError(res.error);
  };

  const togglePublish = async (tour: TournamentInfo) => {
    setTogglingId(tour.id);
    setError(null);
    const nextStatus = tour.status === 'published' ? 'draft' : 'published';
    const res = await api.updateTournament(tour.id, { status: nextStatus });
    setTogglingId(null);
    if (res.ok === true) {
      setTournaments(prev => prev?.map(t2 => (t2.id === tour.id ? res.data : t2)) ?? prev);
    } else {
      setError(res.error);
    }
  };

  const createTournament = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await api.createTournament({
      name: name.trim(),
      eventDate: eventDate || undefined,
      location: location.trim() || undefined,
      description: description.trim() || undefined,
    });
    setSubmitting(false);
    if (res.ok === true) onOpenTournament(res.data.token, res.data.tournament);
    else setError(res.error);
  };

  const statusLabel = (status: TournamentInfo['status']) => {
    if (status === 'published') return t.tournamentStatusPublished;
    if (status === 'archived') return t.tournamentStatusArchived;
    return t.tournamentStatusDraft;
  };

  const statusColor = (status: TournamentInfo['status']) => {
    if (status === 'published') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (status === 'archived') return 'bg-slate-800 text-slate-500 border-slate-700';
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  };

  const inputClass = "w-full px-5 py-3 rounded-xl bg-white/10 text-white placeholder-gray-400 text-sm outline-none focus:ring-2 focus:ring-white/30 transition-shadow";
  const labelClass = "text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1";

  return (
    <div className="relative min-h-screen bg-[#121212] overflow-hidden">
      <LiquidBackground />
      <div className="relative z-10 max-w-2xl mx-auto p-6 py-16">
        <div className="flex items-center justify-between mb-10 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-white">{t.tournamentsHubTitle}</h1>
            <p className="text-gray-400 text-sm mt-1">{t.tournamentsHubSub}</p>
          </div>
          <button onClick={onLogout} className="text-xs font-medium text-gray-400 hover:text-white shrink-0">{t.authLogout}</button>
        </div>

        {error && <p className="mb-6 text-sm text-red-400 text-center">{error}</p>}

        {tournaments !== null && tournaments.length > 0 && (
          <div className="space-y-4 mb-8">
            {tournaments.map(tour => (
              <div key={tour.id} className="rounded-2xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm border border-white/10 p-6 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-white font-semibold truncate">{tour.name}</h3>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 ${statusColor(tour.status)}`}>{statusLabel(tour.status)}</span>
                  </div>
                  <p className="text-gray-400 text-xs mt-1 truncate">
                    {[tour.eventDate, tour.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    disabled={openingId === tour.id}
                    onClick={() => openTournament(tour.id)}
                    className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-5 py-3 rounded-full transition disabled:opacity-50"
                  >
                    {t.openTournamentButton}
                  </button>
                  {tour.status !== 'archived' && (
                    <button
                      disabled={togglingId === tour.id}
                      onClick={() => togglePublish(tour)}
                      className="text-[10px] font-medium text-gray-400 hover:text-white transition disabled:opacity-50"
                    >
                      {tour.status === 'published' ? t.unpublishButton : t.publishButton}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tournaments !== null && tournaments.length === 0 && !showCreate && (
          <p className="text-center text-gray-500 text-sm mb-8">{t.noTournamentsYet}</p>
        )}

        <div className="rounded-2xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm border border-white/10 p-6">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-5 py-3 rounded-full transition">
              + {t.createTournamentButton}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 className="text-white font-semibold mb-1">{t.createTournamentTitle}</h3>
              <input placeholder={t.tournamentNameLabel} value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              <div className="space-y-1">
                <label className={labelClass}>{t.tournamentDateLabel}</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} />
              </div>
              <input placeholder={t.tournamentLocationLabel} value={location} onChange={e => setLocation(e.target.value)} className={inputClass} />
              <textarea placeholder={t.tournamentDescriptionLabel} value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
              <button disabled={!name.trim() || submitting} onClick={createTournament} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-3 rounded-full transition disabled:opacity-50">
                {t.createTournamentButton}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TournamentsHub;
