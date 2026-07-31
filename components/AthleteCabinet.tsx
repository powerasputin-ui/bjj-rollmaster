import React, { useEffect, useRef, useState } from 'react';
import { AgeGroup, BeltColor } from '../types';
import type { TranslationKeys } from '../translations';
import {
  publicApi, athleteApi,
  getAthleteToken, setAthleteToken, clearAthleteToken,
  type AthleteRegistration,
} from '../services/api';
import { connectCalledSocket, type CalledSocket } from '../services/matSocket';

interface AthleteCabinetProps {
  t: TranslationKeys;
  confirmToken?: string;
  loginToken?: string;
}

// Athlete-facing cabinet: passwordless (magic link) sign-in, list of the
// athlete's registrations across every organizer/tournament, and editing of
// a registration while it's still pending. Styled to match PublicCatalog/
// PublicRegister (classic dark/indigo site style).
const AthleteCabinet: React.FC<AthleteCabinetProps> = ({ t, confirmToken, loginToken }) => {
  const [resolving, setResolving] = useState(!!confirmToken || !!loginToken);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(() => !!getAthleteToken());

  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [sending, setSending] = useState(false);

  const [registrations, setRegistrations] = useState<AthleteRegistration[] | null>(null);
  const [calledBanner, setCalledBanner] = useState<{ tournamentName: string; mat: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AthleteRegistration>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resolvedRef = useRef(false);

  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    (async () => {
      if (confirmToken) {
        const res = await publicApi.verifyRegistration(confirmToken);
        if (res.ok === true) {
          setAthleteToken(res.data.token);
          setHasToken(true);
        } else {
          setResolveError(t.confirmEmailError);
        }
        window.history.replaceState({}, '', window.location.pathname + '?cabinet=true');
      } else if (loginToken) {
        const res = await publicApi.athleteLogin(loginToken);
        if (res.ok === true) {
          setAthleteToken(res.data.token);
          setHasToken(true);
        } else {
          setResolveError(t.athleteLoginError);
        }
        window.history.replaceState({}, '', window.location.pathname + '?cabinet=true');
      }
      setResolving(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRegistrations = () => {
    athleteApi.me().then(res => {
      if (res.ok === true) setRegistrations(res.data);
      else {
        clearAthleteToken();
        setHasToken(false);
      }
    });
  };

  useEffect(() => {
    if (hasToken && !resolving) loadRegistrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasToken, resolving]);

  // Listens for "your match was called" broadcasts on every tournament the
  // athlete has an approved (competing) registration in — see
  // services/matSocket.ts's connectCalledSocket and the server-side
  // broadcastMatchCalled it's paired with.
  useEffect(() => {
    if (!registrations) return;
    const approved = registrations.filter(r => r.status === 'approved');
    const myCompetitorIds = new Set(approved.map(r => r.id));
    const slugs = Array.from(new Set(approved.map(r => r.tournamentSlug)));

    const sockets: CalledSocket[] = slugs.map(slug => connectCalledSocket(slug, event => {
      const isMine = (event.competitor1Id && myCompetitorIds.has(event.competitor1Id))
        || (event.competitor2Id && myCompetitorIds.has(event.competitor2Id));
      if (!isMine) return;
      const reg = approved.find(r => r.tournamentSlug === slug);
      setCalledBanner({ tournamentName: reg?.tournamentName ?? '', mat: event.mat });
    }));

    return () => sockets.forEach(s => s.close());
  }, [registrations]);

  const sendLoginLink = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    await publicApi.requestAthleteLogin(email.trim());
    setSending(false);
    setLinkSent(true);
  };

  const startEdit = (reg: AthleteRegistration) => {
    setEditingId(reg.id);
    setEditForm({ ...reg });
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setSaveError(null);
  };

  const saveEdit = async () => {
    if (!editingId || saving) return;
    setSaving(true);
    setSaveError(null);
    const res = await athleteApi.updateRegistration(editingId, {
      name: (editForm.name ?? '').trim(),
      belt: editForm.belt as BeltColor,
      weight: (editForm.weight ?? '').toString(),
      team: (editForm.team ?? '').trim(),
      ageGroup: editForm.ageGroup as AgeGroup,
      isAbsolute: editForm.isAbsolute || false,
    });
    setSaving(false);
    if (res.ok === true) {
      setEditingId(null);
      loadRegistrations();
    } else {
      setSaveError(t.cabinetEditLocked);
    }
  };

  const logout = () => {
    clearAthleteToken();
    setHasToken(false);
    setRegistrations(null);
  };

  const statusLabel = (status?: string) => {
    if (status === 'approved') return t.cabinetStatusApproved;
    if (status === 'pending') return t.cabinetStatusPending;
    return t.cabinetStatusRejected;
  };

  const statusColor = (status?: string) => {
    if (status === 'approved') return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    if (status === 'pending') return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  if (resolving) {
    return (
      <div className="min-h-screen bjj-gradient flex items-center justify-center p-6">
        <p className="text-slate-400 text-sm">{t.confirmingEmail}</p>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="min-h-screen bjj-gradient flex items-center justify-center p-6 py-12">
        <div className="bg-slate-900 border border-slate-800/80 w-full max-w-md rounded-[3rem] p-10 shadow-2xl">
          <h1 className="text-2xl font-black mb-2 text-white tracking-tight uppercase">{t.cabinetTitle}</h1>
          {resolveError && <p className="text-rose-400 text-xs font-bold mb-4">{resolveError}</p>}

          {linkSent ? (
            <p className="text-slate-400 text-sm">{t.cabinetLinkSent}</p>
          ) : (
            <>
              <p className="text-slate-500 text-sm mb-8">{t.cabinetLoginSub}</p>
              <div className="space-y-2 mb-6">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.emailLabel}</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 transition-colors shadow-inner text-sm"
                />
              </div>
              <button
                disabled={!email.trim() || sending}
                onClick={sendLoginLink}
                className={`w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all ${email.trim() && !sending ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50 grayscale'}`}
              >
                {t.cabinetSendLink}
              </button>
            </>
          )}

          <a href="?" className="block text-center text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest mt-8">
            {t.cabinetBackToCatalog}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bjj-gradient p-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">{t.cabinetMyRegistrations}</h1>
            {resolveError && <p className="text-rose-400 text-xs font-bold mt-2">{resolveError}</p>}
          </div>
          <button onClick={logout} className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest shrink-0">
            {t.cabinetLogout}
          </button>
        </div>

        {calledBanner && (
          <div className="mb-8 bg-amber-500 text-slate-950 rounded-3xl p-6 shadow-2xl flex items-center justify-between gap-4 animate-in fade-in zoom-in duration-300">
            <div className="min-w-0">
              <p className="font-black uppercase tracking-widest text-xs">{t.calledToMatBanner}</p>
              <p className="font-bold truncate mt-1">{calledBanner.tournamentName} — {t.mat} {calledBanner.mat}</p>
            </div>
            <button onClick={() => setCalledBanner(null)} className="shrink-0 w-8 h-8 rounded-xl bg-slate-950/10 hover:bg-slate-950/20 flex items-center justify-center font-black">✕</button>
          </div>
        )}

        {registrations === null && (
          <p className="text-center text-slate-500 text-sm py-12">…</p>
        )}

        {registrations !== null && registrations.length === 0 && (
          <p className="text-center text-slate-500 text-sm py-12">{t.cabinetNoRegistrations}</p>
        )}

        {registrations !== null && registrations.length > 0 && (
          <div className="space-y-4">
            {registrations.map(reg => (
              <div key={reg.id} className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                {editingId === reg.id ? (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.fullName}</label>
                      <input value={editForm.name ?? ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 font-black outline-none focus:border-indigo-500 text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.belt}</label>
                        <select value={editForm.belt} onChange={e => setEditForm({ ...editForm, belt: e.target.value as BeltColor })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 font-black appearance-none outline-none focus:border-indigo-500 cursor-pointer text-sm">
                          {(editForm.ageGroup === 'Adult' ? ['White', 'Blue', 'Purple', 'Brown', 'Black'] : ['White', 'Grey', 'Yellow', 'Orange', 'Green']).map(b => (
                            <option key={b} value={b}>{t.belts[b as BeltColor]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.weight}</label>
                        <input value={editForm.weight ?? ''} onChange={e => setEditForm({ ...editForm, weight: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 font-black outline-none focus:border-indigo-500 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.team}</label>
                      <input value={editForm.team ?? ''} onChange={e => setEditForm({ ...editForm, team: e.target.value })} className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-4 font-black outline-none focus:border-indigo-500 text-sm" />
                    </div>
                    {saveError && <p className="text-rose-400 text-xs font-bold">{saveError}</p>}
                    <div className="flex gap-3">
                      <button onClick={saveEdit} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 disabled:opacity-50">
                        {t.cabinetSaveButton}
                      </button>
                      <button onClick={cancelEdit} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-95">
                        {t.cabinetCancelButton}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-white font-black truncate">{reg.tournamentName}</h3>
                      <p className="text-slate-500 text-xs mt-1 truncate">
                        {reg.name} · {t.belts[reg.belt]} · {reg.weight} kg · {reg.team}
                      </p>
                      <span className={`inline-block mt-2 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${statusColor(reg.status)}`}>
                        {statusLabel(reg.status)}
                      </span>
                    </div>
                    {reg.status === 'pending' && (
                      <button onClick={() => startEdit(reg)} className="shrink-0 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all active:scale-95">
                        {t.cabinetEditButton}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <a href="?" className="block text-center text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest mt-8">
          {t.cabinetBackToCatalog}
        </a>
      </div>
    </div>
  );
};

export default AthleteCabinet;
