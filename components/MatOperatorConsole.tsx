import React, { useEffect, useState } from 'react';
import type { Competitor, Match, MatchEvent, Score, TimerConfig } from '../types';
import type { TranslationKeys } from '../translations';
import { publicApi, matOperatorApi } from '../services/api';
import Timer from './Timer';

interface MatOperatorConsoleProps {
  t: TranslationKeys;
  slug: string;
  mat: string;
  opToken: string;
}

const DEFAULT_TIMER_CONFIG: TimerConfig = { roundDuration: 300, restDuration: 60, rounds: 1 };
const POLL_INTERVAL_MS = 4000;

// Referee/scorekeeper console for one mat — reached via a short-lived link
// the organizer generates in Settings. Self-contained (fetches its own data
// from the same public read endpoints the TV display uses), matching the
// pattern of PublicBrackets.tsx/AthleteCabinet.tsx. Writes (finishing a
// match) go through matOperatorApi using the mat-token embedded in the URL,
// never persisted to storage — the referee just keeps using the shared link.
const MatOperatorConsole: React.FC<MatOperatorConsoleProps> = ({ t, slug, mat, opToken }) => {
  const [tournamentName, setTournamentName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [timerConfig, setTimerConfig] = useState<TimerConfig>(DEFAULT_TIMER_CONFIG);

  useEffect(() => {
    if (!slug || !mat || !opToken) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [infoRes, compRes, matchRes, timerRes] = await Promise.all([
        publicApi.getTournamentInfo(slug),
        publicApi.getCompetitors(slug),
        publicApi.getMatches(slug),
        publicApi.getTimerConfig(slug),
      ]);
      if (cancelled) return;
      if (infoRes.ok === true) setTournamentName(infoRes.data.name);
      else setNotFound(true);
      if (compRes.ok) setCompetitors(compRes.data);
      if (matchRes.ok) setMatches(matchRes.data);
      if (timerRes.ok) setTimerConfig(timerRes.data);
    };

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slug, mat, opToken]);

  const handleFinish = (matchId: string, winnerId: string, method: string, s1: Score, s2: Score, logs: MatchEvent[]) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, winnerId, score1: s1, score2: s2, logs, status: 'finished' as const, winMethod: method } : m));
    matOperatorApi.finishMatch(opToken, matchId, { winnerId, method, score1: s1, score2: s2, logs }).then(res => {
      if (res.ok === false) console.error('Failed to finish match', res.error);
    });
  };

  if (notFound) {
    return (
      <div className="min-h-screen bjj-gradient flex items-center justify-center p-6">
        <p className="text-slate-400 text-sm">{t.liveBracketsNotFound}</p>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-[100dvh] bg-slate-950 overflow-hidden flex flex-col">
      <div className="flex items-center gap-4 px-6 pt-4 shrink-0">
        <h1 className="text-lg font-black text-white tracking-tight uppercase truncate">{tournamentName ?? '…'}</h1>
        <span className="shrink-0 text-[10px] font-black text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-3 py-1 rounded-full uppercase tracking-widest">
          {t.matOperatorTitle}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Timer
          config={timerConfig}
          setConfig={setTimerConfig}
          t={t}
          matches={matches}
          competitors={competitors}
          onFinishMatch={handleFinish}
          tournamentSlug={slug}
          lockedMat={mat}
          hideSettings
          wsAuthToken={opToken}
        />
      </div>
    </div>
  );
};

export default MatOperatorConsole;
