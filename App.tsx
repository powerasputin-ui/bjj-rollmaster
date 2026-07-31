
import React, { useState, useEffect, useRef } from 'react';
import { View, Competitor, Match, TimerConfig, Score, MatchEvent } from './types';
import { Icons } from './constants';
import Timer from './components/Timer';
import TournamentManager, { RosterFilterRequest } from './components/TournamentManager';
import Dashboard from './components/Dashboard';
import BracketView from './components/BracketView';
import PublicRegister from './components/PublicRegister';
import PendingRegistrations from './components/PendingRegistrations';
import AuthScreen from './components/AuthScreen';
import TournamentsHub from './components/TournamentsHub';
import PublicCatalog from './components/PublicCatalog';
import { translations } from './translations';
import {
  api, publicApi,
  getUserToken, setUserToken, clearUserToken,
  getSessionToken, setSessionToken, clearSessionToken,
  type TournamentInfo,
} from './services/api';

const DEFAULT_TIMER_CONFIG: TimerConfig = { roundDuration: 300, restDuration: 60, rounds: 1 };
const POLL_INTERVAL_MS = 4000;
const LANGUAGE_STORAGE_KEY = 'bjj_language';

// Respects an explicit prior choice (stored on toggle); otherwise infers from
// the browser/OS locale so a fresh visitor sees their own language, not
// always Russian.
function detectLanguage(): 'en' | 'ru' {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  } catch {
    /* localStorage unavailable */
  }
  const nav = (navigator.language || navigator.languages?.[0] || '').toLowerCase();
  return nav.startsWith('ru') ? 'ru' : 'en';
}

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [language, setLanguage] = useState<'en' | 'ru'>(() => detectLanguage());
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);
  const [pendingRegistrations, setPendingRegistrations] = useState<Competitor[]>([]);
  const [logoError, setLogoError] = useState(false);
  const [rosterFilterRequest, setRosterFilterRequest] = useState<RosterFilterRequest | null>(null);
  const [copiedFlash, setCopiedFlash] = useState(false);

  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [hasUserToken, setHasUserToken] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlParams = new URLSearchParams(window.location.search);
  const isDisplayMode = urlParams.has('display');
  const isRegisterMode = urlParams.has('register');
  const resetToken = urlParams.get('resetToken');
  const isLoginMode = urlParams.has('login') || !!resetToken;
  const publicSlug = urlParams.get('t') || '';
  const urlLang = urlParams.get('lang');
  const displayLang = urlLang === 'en' || urlLang === 'ru' ? urlLang : detectLanguage();
  const t = (isDisplayMode || isRegisterMode || (!authChecked || !hasUserToken || !tournament)) ? translations[displayLang] : translations[language];

  useEffect(() => {
    if (isDisplayMode) setCurrentView(View.TIMER);
  }, [isDisplayMode]);

  // Restore the organizer's session on load (skipped entirely for the public
  // register/display modes, which never require a login). Two tiers: the
  // user-token (account identity) is validated first, then — if an active
  // tournament session-token also exists from a prior visit — its details are
  // fetched too, so a reload doesn't dump the organizer back into the hub.
  useEffect(() => {
    if (isRegisterMode || isDisplayMode) {
      setAuthChecked(true);
      return;
    }
    const uToken = getUserToken();
    if (!uToken) {
      setAuthChecked(true);
      return;
    }
    (async () => {
      const meRes = await api.me();
      if (meRes.ok !== true) {
        clearUserToken();
        clearSessionToken();
        setAuthChecked(true);
        return;
      }
      setHasUserToken(true);
      setUserEmail(meRes.data.email);

      if (getSessionToken()) {
        const tRes = await api.getCurrentTournament();
        if (tRes.ok === true) setTournament(tRes.data);
        else clearSessionToken();
      }
      setAuthChecked(true);
    })();
  }, [isRegisterMode, isDisplayMode]);

  // Authenticated organizer data — polls the session-scoped REST API.
  useEffect(() => {
    if (isRegisterMode || isDisplayMode || !tournament) return;

    let cancelled = false;
    const load = async () => {
      const [compRes, matchRes, timerRes, pendingRes] = await Promise.all([
        api.getCompetitors(),
        api.getMatches(),
        api.getTimerConfig(),
        api.getPendingRegistrations(),
      ]);
      if (cancelled) return;
      if (compRes.ok) setCompetitors(compRes.data);
      if (matchRes.ok) setMatches(matchRes.data);
      if (timerRes.ok) setTimerConfig(timerRes.data);
      if (pendingRes.ok) setPendingRegistrations(pendingRes.data);
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isRegisterMode, isDisplayMode, tournament]);

  // TV display — public, tournament identified by ?t=<slug> in the URL, no login.
  useEffect(() => {
    if (!isDisplayMode || !publicSlug) return;

    let cancelled = false;
    const load = async () => {
      const [compRes, matchRes, timerRes] = await Promise.all([
        publicApi.getCompetitors(publicSlug),
        publicApi.getMatches(publicSlug),
        publicApi.getTimerConfig(publicSlug),
      ]);
      if (cancelled) return;
      if (compRes.ok) setCompetitors(compRes.data);
      if (matchRes.ok) setMatches(matchRes.data);
      if (timerRes.ok) setTimerConfig(timerRes.data);
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isDisplayMode, publicSlug]);

  const handleAuthenticated = async (token: string) => {
    setUserToken(token);
    setHasUserToken(true);
    const meRes = await api.me();
    if (meRes.ok === true) setUserEmail(meRes.data.email);
  };

  const handleOpenTournament = (token: string, tournamentInfo: TournamentInfo) => {
    setSessionToken(token);
    setTournament(tournamentInfo);
  };

  const handleSwitchTournament = () => {
    clearSessionToken();
    setTournament(null);
    setCompetitors([]);
    setMatches([]);
    setTimerConfig(DEFAULT_TIMER_CONFIG);
    setPendingRegistrations([]);
    setCurrentView(View.DASHBOARD);
  };

  const handleLogout = () => {
    clearUserToken();
    clearSessionToken();
    window.location.reload();
  };

  const copyRegisterLink = () => {
    if (!tournament) return;
    const url = `${window.location.origin}/?register=true&t=${tournament.slug}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 2000);
    });
  };

  const updateTimerConfig = (next: TimerConfig) => {
    setTimerConfig(next);
    api.updateTimerConfig(next).then(res => {
      if (res.ok === false) console.error('Failed to persist timer config', res.error);
    });
  };

  const onCallToMat = (matchId: string, matId: string) => {
    setMatches(prev => prev.map(m => {
      if (m.mat === matId && m.status === 'ongoing') return { ...m, status: 'pending' as const };
      if (m.id === matchId) return { ...m, mat: matId, status: 'ongoing' as const };
      return m;
    }));
    setCurrentView(View.TIMER);
    api.callToMat(matchId, matId).then(res => {
      if (res.ok === false) console.error('Failed to call match to mat', res.error);
    });
  };

  const onFinishMatchFromTimer = (matchId: string, winnerId: string, method: string, s1: Score, s2: Score, logs: MatchEvent[]) => {
    setMatches(prev => {
      const current = prev.find(m => m.id === matchId);
      if (!current) return prev;

      let nextState = prev.map(m => m.id === matchId ? {
        ...m,
        winnerId,
        score1: s1,
        score2: s2,
        logs,
        status: 'finished' as const,
        winMethod: method
      } : m);

      if (current.nextMatchId) {
        const isFirst = matchId.includes('idx') && parseInt(matchId.split('idx').pop() || '0') % 2 === 0;
        nextState = nextState.map(nm => {
          if (nm.id === current.nextMatchId) {
            return isFirst ? { ...nm, competitor1Id: winnerId } : { ...nm, competitor2Id: winnerId };
          }
          return nm;
        });
      }
      return nextState;
    });
    api.finishMatch(matchId, { winnerId, method, score1: s1, score2: s2, logs }).then(res => {
      if (res.ok === false) console.error('Failed to finish match', res.error);
    });
  };

  const handleApproveRegistration = (id: string) => {
    setPendingRegistrations(prev => prev.filter(c => c.id !== id));
    api.approveRegistration(id).then(res => {
      if (res.ok === false) console.error('Failed to approve registration', res.error);
    });
  };

  const handleRejectRegistration = (id: string) => {
    setPendingRegistrations(prev => prev.filter(c => c.id !== id));
    api.rejectRegistration(id).then(res => {
      if (res.ok === false) console.error('Failed to reject registration', res.error);
    });
  };

  const exportData = () => {
    const data = { competitors, matches, timerConfig, version: "1.1", timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `bjj_tournament_export.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const MAX_COMPETITORS = 5000;
  const MAX_MATCHES = 50000;

  const isValidCompetitor = (c: unknown): c is Competitor => {
    if (!c || typeof c !== 'object') return false;
    const o = c as Record<string, unknown>;
    return typeof o.id === 'string' && typeof o.name === 'string' && o.name.length <= 200
      && typeof o.belt === 'string' && typeof o.weight === 'string' && typeof o.team === 'string' && o.team.length <= 200
      && (o.ageGroup === 'Adult' || o.ageGroup === 'Kid');
  };

  const isValidMatch = (m: unknown): m is Match => {
    if (!m || typeof m !== 'object') return false;
    const o = m as Record<string, unknown>;
    return typeof o.id === 'string' && typeof o.bracketId === 'string' && typeof o.round === 'number'
      && (o.status === 'pending' || o.status === 'ongoing' || o.status === 'finished');
  };

  const isValidTimerConfig = (tc: unknown): tc is TimerConfig => {
    if (!tc || typeof tc !== 'object') return false;
    const o = tc as Record<string, unknown>;
    return typeof o.roundDuration === 'number' && o.roundDuration >= 1 && o.roundDuration <= 7200
      && typeof o.restDuration === 'number' && o.restDuration >= 0 && o.restDuration <= 600
      && typeof o.rounds === 'number' && o.rounds >= 1 && o.rounds <= 99;
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_SIZE_BYTES) {
      alert(t.importErrorTooBig ?? 'File is too large (max 5MB).');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        if (typeof raw !== 'string' || raw.length > MAX_IMPORT_SIZE_BYTES) throw new Error('Invalid');
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (!data.competitors || !Array.isArray(data.competitors)) throw new Error('Invalid structure');
        if (data.competitors.length > MAX_COMPETITORS) throw new Error('Too many competitors');
        const competitorsSafe = data.competitors.filter(isValidCompetitor);
        if (competitorsSafe.length !== data.competitors.length) throw new Error('Invalid competitor data');

        let matchesSafe: Match[] = [];
        if (data.matches && Array.isArray(data.matches)) {
          if (data.matches.length > MAX_MATCHES) throw new Error('Too many matches');
          matchesSafe = (data.matches as unknown[]).filter(isValidMatch);
        }
        const timerConfigSafe = data.timerConfig && isValidTimerConfig(data.timerConfig) ? data.timerConfig : timerConfig;

        api.importAll({ competitors: competitorsSafe, matches: matchesSafe, timerConfig: timerConfigSafe }).then(res => {
          if (res.ok === true) {
            setCompetitors(res.data.competitors);
            setMatches(res.data.matches);
            setTimerConfig(timerConfigSafe);
            alert(t.importSuccess ?? t.categoryFinished ?? 'Success!');
          } else {
            alert(t.importErrorInvalid ?? 'File is corrupted or invalid.');
          }
        });
      } catch {
        alert(t.importErrorInvalid ?? 'File is corrupted or invalid.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReset = async () => {
    if (!confirm(t.resetDesc)) return;
    const res = await api.resetAll();
    if (res.ok === false) {
      console.error('Failed to reset tournament', res.error);
      return;
    }
    window.location.reload();
  };

  // Public self-registration page — no nav, no roster/match data, reachable via a
  // shared link/QR code at the venue. Without a specific tournament slug, fall
  // back to the public catalog so the athlete can find one first.
  if (isRegisterMode) {
    if (!publicSlug) return <PublicCatalog t={t} />;
    return (
      <div className="min-h-screen bjj-gradient">
        <PublicRegister t={t} slug={publicSlug} />
      </div>
    );
  }

  // TV / display-only mode (separate window) — language from URL ?lang=en|ru
  if (isDisplayMode) {
    return (
      <div className="h-screen max-h-[100dvh] bg-slate-950 overflow-hidden">
        <Timer
          config={timerConfig}
          setConfig={setTimerConfig}
          isDisplayOnly
          t={t}
          language={displayLang}
          matches={matches}
          competitors={competitors}
          onFinishMatch={onFinishMatchFromTimer}
          tournamentSlug={publicSlug}
        />
      </div>
    );
  }

  if (!authChecked) {
    return <div className="h-screen bjj-gradient" />;
  }

  // Smoothcomp-style default: the bare site is a public tournament catalog
  // for athletes. Organizer sign-in is a deliberately separate path
  // (?login=true, or a password-reset link) rather than the default landing.
  if (!hasUserToken) {
    return isLoginMode
      ? <AuthScreen t={t} initialResetToken={resetToken} onAuthenticated={handleAuthenticated} />
      : <PublicCatalog t={t} />;
  }

  if (!tournament) {
    return <TournamentsHub t={t} onOpenTournament={handleOpenTournament} onLogout={handleLogout} />;
  }

  function renderView() {
    switch (currentView) {
      case View.DASHBOARD: return <Dashboard competitors={competitors} matches={matches} t={t} onSelectBelt={(belt, ageGroup) => { setRosterFilterRequest({ belt, ageGroup }); setCurrentView(View.TOURNAMENT); }} />;
      case View.TIMER: return <Timer config={timerConfig} setConfig={setTimerConfig} isDisplayOnly={isDisplayMode} t={t} language={language} matches={matches} competitors={competitors} onFinishMatch={onFinishMatchFromTimer} tournamentSlug={tournament?.slug} />;
      case View.TOURNAMENT: return <TournamentManager competitors={competitors} setCompetitors={setCompetitors} matches={matches} setMatches={setMatches} t={t} filterRequest={rosterFilterRequest} onFilterRequestApplied={() => setRosterFilterRequest(null)} />;
      case View.BRACKETS: return <BracketView competitors={competitors} matches={matches} setMatches={setMatches} setCompetitors={setCompetitors} t={t} onCallToMat={onCallToMat} />;
      case View.PENDING: return <PendingRegistrations t={t} pending={pendingRegistrations} onApprove={handleApproveRegistration} onReject={handleRejectRegistration} />;
      case View.SETTINGS:
        return (
          <div className="p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            <h2 className="text-3xl font-black text-white">{t.settings}</h2>

            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-sm font-black uppercase text-indigo-400 mb-6 tracking-widest flex items-center gap-2">
                <Icons.Timer /> {t.timer}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">{t.roundDurationLabel}</label>
                  <input
                    type="number"
                    value={timerConfig.roundDuration / 60}
                    onChange={e => updateTimerConfig({...timerConfig, roundDuration: Math.max(1, parseInt(e.target.value) || 0) * 60})}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">{t.restDurationLabel}</label>
                  <input
                    type="number"
                    value={timerConfig.restDuration}
                    onChange={e => updateTimerConfig({...timerConfig, restDuration: Math.max(0, parseInt(e.target.value) || 0)})}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">{t.roundsCountLabel}</label>
                  <input
                    type="number"
                    value={timerConfig.rounds}
                    onChange={e => updateTimerConfig({...timerConfig, rounds: Math.max(1, parseInt(e.target.value) || 1)})}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </section>

            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-sm font-black uppercase text-slate-500 mb-6 tracking-widest">{t.authAccount}</h3>
              {userEmail && <p className="text-white font-bold mb-1">{userEmail}</p>}
              <p className="text-slate-500 text-xs mb-4">{tournament.name}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={handleSwitchTournament} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all active:scale-95">
                  {t.switchTournamentButton}
                </button>
                <button onClick={handleLogout} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all active:scale-95">
                  {t.authLogout}
                </button>
              </div>
            </section>

            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-sm font-black uppercase text-slate-500 mb-2 tracking-widest">{t.authShareLinkTitle}</h3>
              <p className="text-[10px] text-slate-500 mb-4">{t.authShareLinkSub}</p>
              <div className="flex gap-3">
                <input
                  readOnly
                  value={`${window.location.origin}/?register=true&t=${tournament.slug}`}
                  className="flex-1 bg-slate-950 border border-slate-800 text-white rounded-xl p-4 font-bold outline-none text-xs"
                />
                <button onClick={copyRegisterLink} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 rounded-xl font-black uppercase text-xs tracking-widest transition-all active:scale-95 shrink-0">
                  {copiedFlash ? t.authCopiedLink : t.authCopyLink}
                </button>
              </div>
            </section>

            <section className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8">
              <h3 className="text-sm font-black uppercase text-slate-500 mb-6 tracking-widest">{t.genSettings}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button onClick={exportData} className="flex items-center justify-between p-5 bg-slate-950 border border-slate-800 rounded-2xl group hover:border-indigo-500 transition-all">
                  <div className="text-left">
                    <p className="font-bold text-white">{t.exportData}</p>
                    <p className="text-[10px] text-slate-500">{t.exportDataSub}</p>
                  </div>
                  <div className="text-indigo-500 group-hover:scale-110 transition-transform"><Icons.Trophy /></div>
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-between p-5 bg-slate-950 border border-slate-800 rounded-2xl group hover:border-emerald-500 transition-all">
                  <div className="text-left">
                    <p className="font-bold text-white">{t.importData}</p>
                    <p className="text-[10px] text-slate-500">{t.importDataSub}</p>
                  </div>
                  <div className="text-emerald-500 group-hover:scale-110 transition-transform"><Icons.Users /></div>
                </button>
                <input type="file" ref={fileInputRef} onChange={importData} className="hidden" accept=".json" />
              </div>
            </section>

            <section className="bg-red-500/5 border border-red-500/20 rounded-3xl p-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                 <div>
                    <h4 className="text-red-500 font-black uppercase text-xs mb-1">{t.dangerZone}</h4>
                    <p className="text-[10px] text-red-500/60 font-bold uppercase">{t.resetDesc}</p>
                 </div>
                 <button onClick={handleReset} className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all">{t.reset}</button>
               </div>
            </section>
          </div>
        );
      default: return <Dashboard competitors={competitors} matches={matches} t={t} />;
    }
  }

  return (
    <div className="h-screen max-h-[100dvh] bjj-gradient flex flex-col md:flex-row overflow-hidden">
      <nav className="w-full md:w-20 lg:w-24 bg-slate-950 border-r border-slate-800 flex md:flex-col items-center justify-between p-4 md:py-8 z-50">
        <div className="flex md:flex-col items-center gap-6">
          <div
            className="w-14 h-14 md:w-12 md:h-12 rounded-2xl flex items-center justify-center shadow-lg cursor-pointer overflow-hidden bg-indigo-600 shrink-0"
            onClick={() => setCurrentView(View.DASHBOARD)}
          >
            {logoError ? (
              <span className="font-black text-white text-lg md:text-xl">BJJ</span>
            ) : (
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full min-w-[7rem] min-h-[7rem] object-contain translate-y-[5px]"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <button onClick={() => setCurrentView(View.DASHBOARD)} className={`p-3 rounded-xl transition-all ${currentView === View.DASHBOARD ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.dashboard}><Icons.Users /></button>
          <button onClick={() => setCurrentView(View.TIMER)} className={`p-3 rounded-xl transition-all ${currentView === View.TIMER ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.timer}><Icons.Timer /></button>
          <button onClick={() => setCurrentView(View.TOURNAMENT)} className={`p-3 rounded-xl transition-all ${currentView === View.TOURNAMENT ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.tournament}><Icons.Trophy /></button>
          <button onClick={() => setCurrentView(View.BRACKETS)} className={`p-3 rounded-xl transition-all ${currentView === View.BRACKETS ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.brackets}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <button onClick={() => setCurrentView(View.PENDING)} className={`relative p-3 rounded-xl transition-all ${currentView === View.PENDING ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.requests}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {pendingRegistrations.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg">
                {pendingRegistrations.length > 99 ? '99+' : pendingRegistrations.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex md:flex-col items-center gap-4">
          <button onClick={() => setLanguage(l => {
            const next = l === 'en' ? 'ru' : 'en';
            try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* ignore */ }
            return next;
          })} className="w-10 h-10 rounded-full border border-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 hover:text-white">{language.toUpperCase()}</button>
          <button onClick={() => setCurrentView(View.SETTINGS)} className={`p-3 rounded-xl transition-all ${currentView === View.SETTINGS ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`} title={t.settings}><Icons.Settings /></button>
        </div>
      </nav>
      <main className="flex-1 min-h-0 flex flex-col bg-[#0f172a] overflow-hidden">
        {/* Timer always mounted so it keeps running when user switches to other tabs */}
        <div className={currentView === View.TIMER ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'hidden'}>
          <Timer config={timerConfig} setConfig={setTimerConfig} isDisplayOnly={isDisplayMode} t={t} matches={matches} competitors={competitors} onFinishMatch={onFinishMatchFromTimer} tournamentSlug={tournament?.slug} />
        </div>
        {currentView !== View.TIMER && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar">
            {renderView()}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
