
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TimerConfig, Score, Match, MatchEvent, Competitor, LiveState } from '../types';
import type { TranslationKeys } from '../translations';
import { connectMatSocket, MatSocket, MatSocketAuth } from '../services/matSocket';
import { api, getSessionToken } from '../services/api';

interface TimerProps {
  config: TimerConfig;
  setConfig: React.Dispatch<React.SetStateAction<TimerConfig>>;
  isDisplayOnly?: boolean;
  t: TranslationKeys;
  language?: 'en' | 'ru';
  matches?: Match[];
  competitors?: Competitor[];
  onFinishMatch?: (matchId: string, winnerId: string, method: string, score1: Score, score2: Score, logs: MatchEvent[]) => void;
  tournamentSlug?: string;
}

const Timer: React.FC<TimerProps> = ({ config, setConfig, isDisplayOnly = false, t, language = 'ru', matches = [], competitors = [], onFinishMatch, tournamentSlug }) => {
  const getInitialMat = () => {
    const params = new URLSearchParams(window.location.search);
    const urlMat = params.get('mat');
    if (isDisplayOnly && urlMat) return urlMat;
    return localStorage.getItem('bjj_selected_mat') || "1";
  };

  const [selectedMat, setSelectedMat] = useState<string>(getInitialMat());
  const [timeLeft, setTimeLeft] = useState(config.roundDuration);
  const [isActive, setIsActive] = useState(false);
  const [isResting, setIsResting] = useState(false);
  const [currentRound, setCurrentRound] = useState(1);
  const [score1, setScore1] = useState<Score>({ points: 0, advantages: 0, penalties: 0 });
  const [score2, setScore2] = useState<Score>({ points: 0, advantages: 0, penalties: 0 });
  const [medTime, setMedTime] = useState<number | null>(null);
  const [matchLog, setMatchLog] = useState<MatchEvent[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [finishWinner, setFinishWinner] = useState<1 | 2 | null>(null);
  const [finishMethod, setFinishMethod] = useState('Points');
  const [finishComment, setFinishComment] = useState('');

  // The match currently called to whichever mat this console/display is showing
  const activeMatch = useMemo(
    () => matches.find(m => m.status === 'ongoing' && (m.mat || '1') === selectedMat),
    [matches, selectedMat]
  );
  const athlete1 = useMemo(() => competitors.find(c => c.id === activeMatch?.competitor1Id), [competitors, activeMatch]);
  const athlete2 = useMemo(() => competitors.find(c => c.id === activeMatch?.competitor2Id), [competitors, activeMatch]);

  const stateRef = useRef({
    timeLeft, isActive, isResting, currentRound, score1, score2, medTime, matchLog, config
  });

  useEffect(() => {
    stateRef.current = { timeLeft, isActive, isResting, currentRound, score1, score2, medTime, matchLog, config };
  }, [timeLeft, isActive, isResting, currentRound, score1, score2, medTime, matchLog, config]);

  // When a different match is called to this mat, start it fresh instead of
  // showing whatever score/time was left on the console from the previous bout.
  const prevActiveMatchIdRef = useRef<string | undefined>(activeMatch?.id);
  useEffect(() => {
    if (isDisplayOnly) return;
    const id = activeMatch?.id;
    if (id && id !== prevActiveMatchIdRef.current) {
      setTimeLeft(config.roundDuration);
      setScore1({ points: 0, advantages: 0, penalties: 0 });
      setScore2({ points: 0, advantages: 0, penalties: 0 });
      setIsActive(false);
      setIsResting(false);
      setCurrentRound(1);
      setMatchLog([]);
      setMedTime(null);
    }
    prevActiveMatchIdRef.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatch?.id, isDisplayOnly]);

  const prevMatRef = useRef(selectedMat);

  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const medTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matSocketRef = useRef<MatSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch (err) {
      console.warn("Audio unavailable", err);
    }
  };

  const playBeep = useCallback((freq = 440, duration = 0.5) => {
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'suspended') return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* audio failed */
    }
  }, []);

  // Applies an incoming live-state snapshot from the server — used both for
  // the TV display (which never generates its own state) and for the
  // controller restoring its previous tick on reconnect/mount (the server
  // replies with the mat's last known state as soon as we join).
  const applySync = useCallback((payload: LiveState | null) => {
    if (!payload) return;
    if (typeof payload.timeLeft === 'number' && payload.timeLeft >= 0 && payload.timeLeft <= 7200) setTimeLeft(payload.timeLeft);
    if (typeof payload.isActive === 'boolean') setIsActive(payload.isActive);
    if (typeof payload.isResting === 'boolean') setIsResting(payload.isResting);
    if (typeof payload.currentRound === 'number' && payload.currentRound >= 1 && payload.currentRound <= 99) setCurrentRound(payload.currentRound);
    if (payload.score1 && typeof payload.score1.points === 'number' && typeof payload.score1.advantages === 'number' && typeof payload.score1.penalties === 'number') setScore1(payload.score1);
    if (payload.score2 && typeof payload.score2.points === 'number' && typeof payload.score2.advantages === 'number' && typeof payload.score2.penalties === 'number') setScore2(payload.score2);
    if (typeof payload.medTime === 'number' || payload.medTime === null) setMedTime(payload.medTime);
    if (Array.isArray(payload.matchLog)) setMatchLog(payload.matchLog.slice(0, 50));
    if (payload.config && typeof payload.config.roundDuration === 'number' && typeof payload.config.restDuration === 'number' && typeof payload.config.rounds === 'number') setConfig(payload.config);
  }, [setConfig]);

  // Connect once; mat switches reuse the same socket via setMat() below.
  // Operator console authenticates with its session JWT (tournamentId derived
  // server-side); the unauthenticated TV display instead sends the public slug.
  useEffect(() => {
    const auth: MatSocketAuth = isDisplayOnly ? { slug: tournamentSlug || '' } : { token: getSessionToken() };
    const socket = connectMatSocket(selectedMat, auth, { onSync: applySync });
    matSocketRef.current = socket;
    return () => { socket.close(); matSocketRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching which mat this console/display follows re-subscribes the socket.
  // If a match was live on the mat we're leaving, we also reset locally —
  // updating stateRef synchronously (not just via setState) so the still-running
  // broadcast interval can't read stale pre-reset values on its next tick and
  // persist them onto the newly-selected mat's channel. We deliberately do NOT
  // eagerly push this reset to the server: the join() below will bring back
  // whatever is *actually* live on the new mat (if anything), and eagerly
  // broadcasting zeros here would race with that and could briefly clobber a
  // genuinely ongoing match's state if the operator switches back to it.
  useEffect(() => {
    const matChanged = selectedMat !== prevMatRef.current;
    prevMatRef.current = selectedMat;

    if (!isDisplayOnly && matChanged) {
      const freshState: LiveState = {
        timeLeft: config.roundDuration,
        isActive: false,
        isResting: false,
        currentRound: 1,
        score1: { points: 0, advantages: 0, penalties: 0 },
        score2: { points: 0, advantages: 0, penalties: 0 },
        medTime: null,
        matchLog: [],
        config,
      };
      stateRef.current = freshState;
      setTimeLeft(freshState.timeLeft);
      setIsActive(freshState.isActive);
      setIsResting(freshState.isResting);
      setCurrentRound(freshState.currentRound);
      setScore1(freshState.score1);
      setScore2(freshState.score2);
      setMedTime(freshState.medTime);
      setMatchLog(freshState.matchLog);
    }

    matSocketRef.current?.setMat(selectedMat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMat, isDisplayOnly]);

  const sendState = useCallback(() => {
    if (isDisplayOnly) return;
    matSocketRef.current?.send({ type: 'state', payload: stateRef.current });
  }, [isDisplayOnly]);

  useEffect(() => {
    if (isDisplayOnly) return;
    const interval = setInterval(sendState, isActive ? 1000 : 2500);
    return () => clearInterval(interval);
  }, [isActive, isDisplayOnly, sendState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTick = useCallback(() => {
    setTimeLeft(prev => {
      if (prev <= 1) {
        playBeep(220, 1.5);
        if (!stateRef.current.isResting && stateRef.current.config.restDuration > 0 && stateRef.current.currentRound < stateRef.current.config.rounds) {
          setIsResting(true);
          return stateRef.current.config.restDuration;
        } else if (stateRef.current.isResting) {
          setIsResting(false);
          setCurrentRound(r => r + 1);
          return stateRef.current.config.roundDuration;
        } else {
          setIsActive(false);
          return 0;
        }
      }
      if (prev <= 6 && !stateRef.current.isResting) playBeep(880, 0.05);
    return prev - 1;
    });
  }, [playBeep]);

  useEffect(() => {
    if (isActive && !isDisplayOnly) {
      timerIntervalRef.current = setInterval(handleTick, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [isActive, handleTick, isDisplayOnly]);

  useEffect(() => {
    if (medTime !== null && medTime > 0 && !isDisplayOnly) {
      medTimerIntervalRef.current = setInterval(() => {
        setMedTime(prev => (prev !== null && prev > 0) ? prev - 1 : 0);
      }, 1000);
    } else {
      if (medTimerIntervalRef.current) clearInterval(medTimerIntervalRef.current);
    }
    return () => { if (medTimerIntervalRef.current) clearInterval(medTimerIntervalRef.current); };
  }, [medTime, isDisplayOnly]);

  const getPointsFontClass = (digits: number, isTV: boolean) => {
    const d = Math.min(3, Math.max(1, digits));

    if (isTV) {
      if (d === 1) return 'text-[clamp(8rem,14vw,18rem)]';
      if (d === 2) return 'text-[clamp(6rem,11vw,14rem)]';
      return 'text-[clamp(4.5rem,9vw,11rem)]';
    }

    if (d === 1) return 'text-[clamp(4rem,8vw,10rem)]';
    if (d === 2) return 'text-[clamp(3.2rem,6.5vw,8rem)]';
    return 'text-[clamp(2.6rem,5vw,6.5rem)]';
  };

  const getSmallScoreFontClass = (digits: number, isTV: boolean) => {
    const d = Math.min(3, Math.max(1, digits));

    if (isTV) {
      if (d === 1) return 'text-[clamp(3rem,5vw,5.5rem)]';
      if (d === 2) return 'text-[clamp(2.4rem,4vw,4.5rem)]';
      return 'text-[clamp(2rem,3.5vw,4rem)]';
    }

    if (d === 1) return 'text-[clamp(2.2rem,4vw,4rem)]';
    if (d === 2) return 'text-[clamp(1.8rem,3.5vw,3.2rem)]';
    return 'text-[clamp(1.5rem,3vw,2.8rem)]';
  };

  const CONTROL_BTN = 'w-[3rem] h-[3rem] min-w-[3rem] min-h-[3rem] shrink-0';
  const CONTROL_BTN_SM = 'w-[2rem] h-[2rem] min-w-[2rem] min-h-[2rem] shrink-0';

  const updateScore = (player: 1 | 2, field: keyof Score, delta: number) => {
    if (isDisplayOnly) return;
    initAudio();
    const setter = player === 1 ? setScore1 : setScore2;
    setter(prev => ({ ...prev, [field]: Math.max(0, Math.min(999, prev[field] + delta)) }));
    
    if (delta !== 0) {
      setMatchLog(prev => [{
        time: formatTime(timeLeft),
        action: delta > 0 ? `+${delta}` : delta.toString(),
        points: field === 'points' ? delta : 0,
        player
      }, ...prev].slice(0, 15));
    }
    playBeep(delta > 0 ? 550 : 350, 0.05);
  };

  const ScoreControl = ({ player }: { player: 1 | 2 }) => {
    const currentScore = player === 1 ? score1 : score2;
    const pointsValue = Math.min(999, currentScore.points);
    const pointsDigits = pointsValue.toString().length;
    const pointsFontClass = getPointsFontClass(pointsDigits, isDisplayOnly);
    const advValue = Math.min(999, currentScore.advantages);
    const advDigits = advValue.toString().length;
    const penValue = Math.min(999, currentScore.penalties);
    const penDigits = penValue.toString().length;
    const accentColor = player === 1 ? 'border-blue-500 shadow-blue-500/40' : 'border-red-500 shadow-red-500/40';
    const bgColor = player === 1 ? 'bg-blue-600/10' : 'bg-red-600/10';

    const cardPadding = isDisplayOnly ? 'p-6' : 'p-[clamp(0.5rem,1.5vw,2.5rem)]';
    const labelSize = isDisplayOnly ? 'text-[clamp(0.75rem,1rem,1.25rem)]' : 'text-[clamp(0.6rem,1.2vh,0.75rem)]';
    const subLabelSize = isDisplayOnly ? 'text-[clamp(0.65rem,0.9rem,1rem)]' : 'text-[clamp(0.55rem,1.1vh,0.7rem)]';
    const athlete = player === 1 ? athlete1 : athlete2;
    const fallbackName = player === 1 ? t.competitorA : t.competitorB;
    const headerName = athlete?.name || fallbackName;
    const subtitle = athlete?.team;

    return (
      <div className={`flex flex-col h-full min-h-0 flex-1 min-w-0 rounded-[clamp(1rem,2.5vw,3rem)] border-2 ${accentColor} ${bgColor} shadow-2xl transition-all overflow-hidden ${cardPadding}`}>
        {/* HEADER */}
        <div className="shrink-0 text-center px-1">
          <h3 className={`${isDisplayOnly ? 'text-[clamp(1rem,1.4rem,1.75rem)]' : 'text-[clamp(0.65rem,1.2vh,0.875rem)]'} font-black uppercase tracking-[0.15em] text-white truncate`}>{headerName}</h3>
          {subtitle && (
            <p className={`${isDisplayOnly ? 'text-[clamp(0.6rem,0.8rem,0.95rem)]' : 'text-[clamp(0.5rem,1vh,0.65rem)]'} font-bold uppercase tracking-widest text-slate-500 truncate mt-1`}>{subtitle}</p>
          )}
        </div>

        {/* Контейнер очков */}
        <div className="flex flex-col items-center flex-1 min-h-0">
          <div className="flex-1 min-h-0 w-full flex items-center justify-center gap-3 md:gap-4 px-2">
            {!isDisplayOnly && (
              <button
                type="button"
                onClick={() => updateScore(player, 'points', -1)}
                className={`${CONTROL_BTN} rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center text-xl font-black text-slate-500 hover:text-white hover:bg-red-600/50 hover:border-red-500 transition-all active:scale-90`}
              >
                −
              </button>
            )}
            <div className={`${isDisplayOnly ? 'w-[clamp(20rem,55%,36rem)]' : 'w-[clamp(12rem,40%,26rem)]'} flex items-center justify-center overflow-hidden shrink-0`}>
              <span
                className={`${pointsFontClass} font-black leading-none tabular-nums text-white`}
              >
                {currentScore.points > 999 ? '999+' : pointsValue}
              </span>
            </div>
            {!isDisplayOnly && (
              <button
                type="button"
                onClick={() => updateScore(player, 'points', 1)}
                className={`${CONTROL_BTN} rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center text-xl font-black text-slate-500 hover:text-white transition-all active:scale-90 ${player === 1 ? 'hover:bg-emerald-600/50 hover:border-emerald-500' : 'hover:bg-red-600/50 hover:border-red-500'}`}
              >
                +
              </button>
            )}
          </div>
          {!isDisplayOnly && (
            <span className={`${labelSize} font-black text-slate-500 uppercase tracking-widest shrink-0 mt-1`}>{t.points}</span>
          )}
          {!isDisplayOnly && (
            <div className="grid grid-cols-2 gap-3 w-full mt-4 max-w-[min(340px,90%)] shrink-0">
              <button type="button" onClick={() => updateScore(player, 'points', 2)} className="py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl text-lg font-black transition-all hover:bg-indigo-600 hover:border-indigo-400 active:scale-95 shadow-2xl">+2</button>
              <button type="button" onClick={() => updateScore(player, 'points', 3)} className="py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl text-lg font-black transition-all hover:bg-indigo-600 hover:border-indigo-400 active:scale-95 shadow-2xl">+3</button>
              <button type="button" onClick={() => updateScore(player, 'points', 4)} className="py-4 bg-slate-900 border border-slate-700 text-white rounded-2xl text-lg font-black transition-all hover:bg-indigo-600 hover:border-indigo-400 active:scale-95 shadow-2xl">+4</button>
              <button type="button" onClick={() => updateScore(player, 'points', -1)} className="py-4 bg-red-950/20 border border-red-500/20 text-red-500 rounded-2xl text-lg font-black transition-all hover:bg-red-600 hover:text-white active:scale-95 shadow-2xl">-1</button>
            </div>
          )}
        </div>

        {/* ADV / PEN — ТВ: по краям; контроллер: по центру своих половин */}
        <div className={`mt-auto pb-6 w-full items-end px-8 md:px-12 ${isDisplayOnly ? 'flex justify-between' : 'grid grid-cols-2'}`}>
          <div className="flex flex-col items-center justify-end gap-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {!isDisplayOnly && (
                <button type="button" onClick={() => updateScore(player, 'advantages', -1)} className={`${CONTROL_BTN_SM} flex items-center justify-center bg-slate-800/80 rounded-full text-slate-400 hover:text-white transition-all text-sm font-bold border border-slate-700`}>−</button>
              )}
              <div className="w-[3.5rem] flex items-center justify-center overflow-hidden shrink-0">
                <span className={`${getSmallScoreFontClass(advDigits, isDisplayOnly)} font-black tabular-nums text-yellow-400`}>
                  {currentScore.advantages > 999 ? '999+' : advValue}
                </span>
              </div>
              {!isDisplayOnly && (
                <button type="button" onClick={() => updateScore(player, 'advantages', 1)} className={`${CONTROL_BTN_SM} flex items-center justify-center bg-slate-800/80 rounded-full text-slate-400 hover:text-white transition-all text-sm font-bold border border-slate-700`}>+</button>
              )}
            </div>
            <span className={`${subLabelSize} font-black text-slate-500 uppercase tracking-[0.2em] ${isDisplayOnly ? 'text-yellow-400/90' : ''}`}>{t.advantages}</span>
          </div>
          <div className="flex flex-col items-center justify-end gap-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {!isDisplayOnly && (
                <button type="button" onClick={() => updateScore(player, 'penalties', -1)} className={`${CONTROL_BTN_SM} flex items-center justify-center bg-slate-800/80 rounded-full text-slate-400 hover:text-white transition-all text-sm font-bold border border-slate-700`}>−</button>
              )}
              <div className="w-[3.5rem] flex items-center justify-center overflow-hidden shrink-0">
                <span className={`${getSmallScoreFontClass(penDigits, isDisplayOnly)} font-black tabular-nums text-red-400`}>
                  {currentScore.penalties > 999 ? '999+' : penValue}
                </span>
              </div>
              {!isDisplayOnly && (
                <button type="button" onClick={() => updateScore(player, 'penalties', 1)} className={`${CONTROL_BTN_SM} flex items-center justify-center bg-slate-800/80 rounded-full text-slate-400 hover:text-white transition-all text-sm font-bold border border-slate-700`}>+</button>
              )}
            </div>
            <span className={`${subLabelSize} font-black text-slate-500 uppercase tracking-[0.2em] ${isDisplayOnly ? 'text-red-400/90' : ''}`}>{t.penalties}</span>
          </div>
        </div>
      </div>
    );
  };

  const handleReset = () => {
    if (isDisplayOnly) return;
    setTimeLeft(config.roundDuration);
    setScore1({ points: 0, advantages: 0, penalties: 0 });
    setScore2({ points: 0, advantages: 0, penalties: 0 });
    setIsActive(false);
    setIsResting(false);
    setMatchLog([]);
    setMedTime(null);
    setTimeout(() => matSocketRef.current?.send({ type: 'reset' }), 10);
  };

  // User-initiated config edits (round/rest duration, rounds count) also persist
  // to the backend, so the value survives across devices/reloads — not just
  // whatever happens to still be live on the WS channel.
  const updateConfig = (updater: (prev: TimerConfig) => TimerConfig) => {
    setConfig(prev => {
      const next = updater(prev);
      api.updateTimerConfig(next).then(res => {
        if (res.ok === false) console.error('Failed to persist timer config', res.error);
      });
      return next;
    });
  };

  const openFinishModal = () => {
    if (!activeMatch) return;
    setFinishWinner(null);
    setFinishMethod('Points');
    setFinishComment('');
    setFinishModalOpen(true);
  };

  const confirmFinishMatch = () => {
    if (!activeMatch || !finishWinner || !onFinishMatch) return;
    const winnerId = finishWinner === 1 ? activeMatch.competitor1Id : activeMatch.competitor2Id;
    if (!winnerId) return;
    const methodLabel = `${t[`${finishMethod.toLowerCase()}Win`] || finishMethod}${finishComment ? ': ' + finishComment : ''}`;
    onFinishMatch(activeMatch.id, winnerId, methodLabel, score1, score2, matchLog);
    setFinishModalOpen(false);
    handleReset();
  };

  return (
    <div className={`${isDisplayOnly ? 'h-screen max-h-[100dvh] w-screen bg-black flex flex-col p-[2vh] overflow-hidden' : 'h-full min-h-0 flex flex-col gap-[clamp(0.25rem,1.5vh,1.5rem)] p-[clamp(0.5rem,1.5vw,1.5rem)] bg-slate-950 overflow-hidden'}`}>
      {!isDisplayOnly && (
        <div className="flex justify-between items-center shrink-0">
          <div className="flex items-center gap-10">
            <h2 className="text-xs font-black text-slate-500 tracking-[0.4em] uppercase">{t.matchConsole}</h2>
            <select value={selectedMat} onChange={(e) => {
              const newMat = e.target.value;
              setSelectedMat(newMat);
              localStorage.setItem('bjj_selected_mat', newMat);
            }} className="bg-slate-900 border border-slate-800 text-white rounded-xl px-5 py-2.5 text-xs font-black outline-none cursor-pointer hover:border-indigo-500 transition-all">
               {[1,2,3,4,5].map(n => <option key={n} value={n.toString()}>{t.mat} {n}</option>)}
            </select>
            {activeMatch ? (
              <span className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {(athlete1?.name || t.competitorA)} vs {(athlete2?.name || t.competitorB)}
              </span>
            ) : (
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{t.noActiveMatch}</span>
            )}
          </div>
          <div className="flex gap-5">
            <button onClick={() => setShowSettings(!showSettings)} className={`px-6 py-3 rounded-xl text-xs font-black transition-all border ${showSettings ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/20' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>⚙️ {t.settings}</button>
            <button onClick={() => window.open(`${window.location.origin}${window.location.pathname}?display=true&mat=${selectedMat}&lang=${language}&t=${tournamentSlug || ''}`, '_blank')} className="px-6 py-3 bg-indigo-600/20 text-indigo-400 rounded-xl text-xs font-black border border-indigo-600/30 uppercase tracking-[0.2em] transition-all hover:bg-indigo-600 hover:text-white">{t.tvDisplay}</button>
          </div>
        </div>
      )}

      {showSettings && !isDisplayOnly && (
        <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-10 animate-in slide-in-from-top-4 shadow-2xl z-[60]">
           <div className="grid grid-cols-3 gap-10">
              <div className="min-w-0">
                <label className="block text-xs font-black text-slate-500 uppercase mb-4 tracking-widest">{t.roundDurationLabel}</label>
                <div className="flex flex-wrap gap-3">
                   {[2, 5, 6, 8, 10].map(m => {
                     const seconds = m * 60;
                     return (
                       <button
                         key={m}
                         type="button"
                         onClick={() => {
                           updateConfig(prev => ({ ...prev, roundDuration: seconds }));
                           setTimeLeft(seconds);
                         }}
                         className={`min-w-[3.5rem] flex-1 py-3 px-2 rounded-xl text-xs font-black border transition-all shrink-0 ${config.roundDuration === seconds ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-white'}`}
                       >
                         {m}m
                       </button>
                     );
                   })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-4 tracking-widest">{t.restDurationLabel}</label>
                <input type="number" value={config.restDuration} onChange={e => updateConfig(prev => ({ ...prev, restDuration: parseInt(e.target.value, 10) || 0 }))} className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-6 py-4 text-sm font-black outline-none focus:border-indigo-500 shadow-inner" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-4 tracking-widest">{t.roundsCountLabel}</label>
                <input type="number" value={config.rounds} onChange={e => updateConfig(prev => ({ ...prev, rounds: Math.max(1, parseInt(e.target.value, 10) || 1) }))} className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-6 py-4 text-sm font-black outline-none focus:border-indigo-500 shadow-inner" />
              </div>
           </div>
        </div>
      )}

      <div className={`flex flex-1 min-h-0 gap-[clamp(0.35rem,1.5vw,1rem)] items-stretch ${isDisplayOnly ? 'flex-row' : 'flex-col lg:flex-row'}`}>
        <ScoreControl player={1} />
        
        <div className={`flex flex-1 min-h-0 min-w-0 flex-col items-center ${isDisplayOnly ? 'justify-center' : 'justify-start'} bg-slate-900/40 rounded-[clamp(0.75rem,2vw,3rem)] border-2 border-slate-800/60 relative overflow-hidden transition-all shadow-inner ${isDisplayOnly ? 'flex-1 min-w-0 p-[2vh]' : 'p-[clamp(0.5rem,1.5vw,2.5rem)]'}`}>
          {medTime !== null && (
            <div className="absolute inset-x-[clamp(0.5rem,2vw,2rem)] top-[clamp(0.5rem,2vh,2rem)] bg-red-600 text-white rounded-[clamp(1rem,2vw,2.5rem)] p-[clamp(0.5rem,2vw,2.5rem)] flex flex-col items-center shadow-2xl animate-in slide-in-from-top-16 z-[100] border-2 border-red-400/40">
              <span className="text-[clamp(0.6rem,1.2vh,0.75rem)] font-black uppercase tracking-[0.4em] mb-1 opacity-80">Medical Time</span>
              <span className="text-[clamp(2rem,8vh,4rem)] font-black tabular-nums drop-shadow-lg">{formatTime(medTime)}</span>
              {!isDisplayOnly && <button onClick={() => setMedTime(null)} className="mt-4 text-[clamp(0.6rem,1vh,0.7rem)] font-black border-2 border-white/40 px-6 py-2 rounded-full uppercase hover:bg-white/10 transition-all">✕ Dismiss</button>}
            </div>
          )}

          {isResting && <div className="mb-[clamp(0.5rem,2vh,2rem)] px-[clamp(0.5rem,2vw,2.5rem)] py-[clamp(0.25rem,1vh,1rem)] text-[clamp(0.6rem,1.2vh,0.875rem)] rounded-full font-black uppercase tracking-[0.3em] bg-yellow-500 text-black shadow-2xl shadow-yellow-500/30">Rest Period</div>}
          
          <div className={`font-black tabular-nums leading-none tracking-tighter drop-shadow-[0_30px_60px_rgba(0,0,0,1)] shrink-0 ${isDisplayOnly ? 'text-[min(15vh,14vw)]' : 'text-[clamp(2.5rem,10vh,10rem)]'} ${timeLeft <= 10 && !isResting ? 'text-red-500 animate-pulse' : 'text-white'}`}>
            {formatTime(timeLeft)}
          </div>
          
          {!isDisplayOnly && (
            <div className="w-full mt-[clamp(0.5rem,2vh,2rem)] space-y-[clamp(0.5rem,2vh,2rem)] flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex gap-2 shrink-0">
                <button onClick={() => { initAudio(); setIsActive(!isActive); }} className={`flex-[2.5] py-8 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl shadow-emerald-900/20 ${isActive ? 'bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}>
                  {isActive ? t.pause : t.start}
                </button>
                <button onClick={() => { initAudio(); setMedTime(m => m === null ? 120 : null); }} className={`flex-1 py-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 text-white shadow-xl min-w-0 ${medTime !== null ? 'bg-red-600 shadow-red-500/20' : 'bg-slate-800 hover:bg-slate-700'}`}>
                  {t.medTimer}
                </button>
                <button onClick={handleReset} className="px-4 py-8 bg-red-600 hover:bg-red-500 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl shrink-0">
                   {t.reset}
                </button>
              </div>

              {activeMatch && (
                <button onClick={openFinishModal} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl shrink-0">
                  🏆 {t.finishMatch}
                </button>
              )}

              <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 p-3 space-y-2 shadow-inner shrink-0">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1">
                    <button onClick={() => setTimeLeft(prev => Math.max(0, prev - 60))} className="flex-1 bg-slate-900 border border-slate-800 py-1.5 rounded-lg text-[0.65rem] font-black text-slate-400 hover:text-white transition-all shadow-xl min-w-0">-1{t.minShort}</button>
                    <button onClick={() => setTimeLeft(prev => prev + 60)} className="flex-1 bg-slate-900 border border-slate-800 py-1.5 rounded-lg text-[0.65rem] font-black text-slate-400 hover:text-white transition-all shadow-xl min-w-0">+1{t.minShort}</button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setTimeLeft(prev => Math.max(0, prev - 10))} className="flex-1 bg-slate-900 border border-slate-800 py-1.5 rounded-lg text-[0.65rem] font-black text-slate-400 hover:text-white transition-all shadow-xl min-w-0">-10{t.secShort}</button>
                    <button onClick={() => setTimeLeft(prev => prev + 10)} className="flex-1 bg-slate-900 border border-slate-800 py-1.5 rounded-lg text-[0.65rem] font-black text-slate-400 hover:text-white transition-all shadow-xl min-w-0">+10{t.secShort}</button>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-950/40 rounded-[clamp(1rem,2vw,2.5rem)] border border-slate-800/80 p-[clamp(0.5rem,1.5vw,2rem)] flex-1 min-h-0 overflow-hidden flex flex-col shadow-inner">
                <h4 className="text-[clamp(0.55rem,1.1vh,0.7rem)] font-black text-slate-600 uppercase mb-[clamp(0.25rem,0.8vh,1rem)] tracking-[0.3em] border-b border-slate-800/50 pb-2 shrink-0">{t.matchLog}</h4>
                <div className="space-y-[clamp(0.2rem,0.6vh,0.75rem)] overflow-hidden min-h-0 flex-1">
                  {matchLog.slice(0, 6).map((ev, i) => (
                    <div key={i} className={`flex items-center justify-between text-[clamp(0.5rem,1vh,0.75rem)] font-bold p-[clamp(0.25rem,0.6vh,0.75rem)] rounded-[clamp(0.5rem,1vw,1rem)] ${ev.player === 1 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-blue-500/5' : 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-red-500/5'}`}>
                      <span className="opacity-50 tabular-nums shrink-0">{ev.time}</span>
                      <span className="flex-1 px-2 truncate uppercase tracking-tight min-w-0">{ev.action} {t.points.toUpperCase()}</span>
                      <span className="font-black text-[clamp(0.45rem,1vh,0.625rem)] px-2 py-0.5 rounded-lg bg-white/10 shrink-0">#{ev.player}</span>
                    </div>
                  ))}
                  {matchLog.length === 0 && <p className="text-center py-[clamp(0.5rem,1.5vh,1.5rem)] text-slate-800 text-[clamp(0.5rem,1vh,0.7rem)] font-black uppercase tracking-[0.2em] italic">...waiting for action</p>}
                </div>
              </div>
            </div>
          )}
        </div>

        <ScoreControl player={2} />
      </div>

      {!isDisplayOnly && (
        <div className="flex justify-center items-center shrink-0 mt-6">
          <div className="flex gap-16 px-16 py-8 bg-slate-900/40 border border-slate-800/80 rounded-full backdrop-blur-2xl shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
            {[
              { label: t.pointsLegend.takedown, color: 'text-blue-400' },
              { label: t.pointsLegend.pass, color: 'text-emerald-400' },
              { label: t.pointsLegend.mount, color: 'text-amber-500' },
              { label: t.pointsLegend.sweep, color: 'text-blue-400' },
            ].map((item, idx) => (
              <span key={idx} className={`text-xs font-black uppercase tracking-[0.3em] ${item.color}`}>{item.label}</span>
            ))}
          </div>
        </div>
      )}

      {finishModalOpen && activeMatch && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800/80 w-full max-w-lg rounded-[3.5rem] p-10 animate-in zoom-in duration-300 shadow-2xl">
            <h3 className="text-3xl font-black mb-10 text-white tracking-tight text-center">{t.finishMatch}</h3>

            <div className="space-y-3 mb-8">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">{t.winner}</label>
              {([1, 2] as const).map(p => {
                const athlete = p === 1 ? athlete1 : athlete2;
                if (!athlete) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setFinishWinner(p)}
                    className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all active:scale-95 ${finishWinner === p ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-950 border-slate-800 text-white'}`}
                  >
                    <span className="font-black">{athlete.name}</span>
                    <span className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">{athlete.team}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-3">
                {['Submission', 'Points', 'Advantages', 'Decision'].map(method => (
                  <button key={method} onClick={() => setFinishMethod(method)} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${finishMethod === method ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{t[`${method.toLowerCase()}Win`] || method}</button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4">Comments</label>
                <input value={finishComment} onChange={e => setFinishComment(e.target.value)} placeholder="RNC, 10-0, OT..." className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 outline-none font-black shadow-inner focus:border-indigo-500 transition-colors" />
              </div>
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setFinishModalOpen(false)} className="flex-1 py-5 bg-slate-800 text-slate-300 rounded-2xl font-black uppercase text-xs tracking-[0.2em] active:scale-95 transition-all">{t.cancel}</button>
              <button
                disabled={!finishWinner}
                onClick={confirmFinishMatch}
                className={`flex-1 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl active:scale-95 transition-all ${finishWinner ? 'bg-emerald-600 text-white shadow-emerald-900/30' : 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'}`}
              >
                {t.finishMatch}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timer;
