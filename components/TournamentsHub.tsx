import React, { useEffect, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { api, type TournamentInfo } from '../services/api';
import type { BracketFormat, SparringFormat } from '../types';

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
  const [defaultBracketFormat, setDefaultBracketFormat] = useState<BracketFormat>('single');
  const [sparringFormat, setSparringFormat] = useState<SparringFormat>('gi');
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
      defaultBracketFormat,
      sparringFormat,
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

  const inputClass = "w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 transition-colors shadow-inner text-sm";
  const labelClass = "text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4";

  return (
    <div className="min-h-screen bjj-gradient p-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">{t.tournamentsHubTitle}</h1>
            <p className="text-slate-500 text-sm mt-1">{t.tournamentsHubSub}</p>
          </div>
          <button onClick={onLogout} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest shrink-0">{t.authLogout}</button>
        </div>

        {error && <p className="mb-6 text-sm text-red-500 font-bold text-center">{error}</p>}

        {tournaments !== null && tournaments.length > 0 && (
          <div className="space-y-4 mb-8">
            {tournaments.map(tour => (
              <div key={tour.id} className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 flex items-center justify-between gap-4 shadow-2xl">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-white font-black truncate">{tour.name}</h3>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full border shrink-0 ${statusColor(tour.status)}`}>{statusLabel(tour.status)}</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-1 truncate">
                    {[tour.eventDate, tour.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    disabled={openingId === tour.id}
                    onClick={() => openTournament(tour.id)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                  >
                    {t.openTournamentButton}
                  </button>
                  {tour.status !== 'archived' && (
                    <button
                      disabled={togglingId === tour.id}
                      onClick={() => togglePublish(tour)}
                      className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition disabled:opacity-50"
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
          <p className="text-center text-slate-500 text-sm mb-8">{t.noTournamentsYet}</p>
        )}

        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl">
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-widest px-6 py-4 rounded-2xl transition-all active:scale-95">
              + {t.createTournamentButton}
            </button>
          ) : (
            <div className="flex flex-col gap-6">
              <h3 className="text-white font-black uppercase tracking-tight">{t.createTournamentTitle}</h3>
              <div className="space-y-2">
                <label className={labelClass}>{t.tournamentNameLabel}</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>{t.tournamentDateLabel}</label>
                <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>{t.tournamentLocationLabel}</label>
                <input value={location} onChange={e => setLocation(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>{t.tournamentDescriptionLabel}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>{t.bracketFormatLabel}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['single', t.bracketFormatSingle, t.bracketFormatSingleHint],
                    ['double', t.bracketFormatDouble, t.bracketFormatDoubleHint],
                    ['round_robin', t.bracketFormatRoundRobin, t.bracketFormatRoundRobinHint],
                  ] as [BracketFormat, string, string][]).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDefaultBracketFormat(value)}
                      title={hint}
                      className={`text-xs font-black uppercase tracking-tight px-3 py-4 rounded-2xl border transition-all ${defaultBracketFormat === value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>{t.sparringFormatLabel}</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['gi', t.sparringFormatGi],
                    ['nogi', t.sparringFormatNoGi],
                    ['both', t.sparringFormatBoth],
                  ] as [SparringFormat, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSparringFormat(value)}
                      className={`text-xs font-black uppercase tracking-tight px-3 py-4 rounded-2xl border transition-all ${sparringFormat === value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                disabled={!name.trim() || submitting}
                onClick={createTournament}
                className={`w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all ${name.trim() && !submitting ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 grayscale'}`}
              >
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
