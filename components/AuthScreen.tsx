
import React, { useEffect, useRef, useState } from 'react';
import type { TranslationKeys } from '../translations';
import { api, type TournamentInfo } from '../services/api';
import LiquidBackground from './LiquidBackground';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

interface AuthScreenProps {
  t: TranslationKeys;
  initialResetToken?: string | null;
  onAuthenticated: (token: string, tournament: TournamentInfo) => void;
}

const ERROR_KEYS: Record<string, keyof TranslationKeys> = {
  invalid_credentials: 'authErrorInvalidCredentials',
  email_taken: 'authErrorEmailTaken',
  weak_password: 'authErrorWeakPassword',
};

const AuthScreen: React.FC<AuthScreenProps> = ({ t, initialResetToken, onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>(initialResetToken ? 'reset' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tournamentName, setTournamentName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const googleBtnRef = useRef<HTMLDivElement>(null);

  const showError = (code: string) => {
    const key = ERROR_KEYS[code];
    setError(key ? (t[key] as string) : (t.authErrorGeneric as string));
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    setInfo(null);
    setLoading(true);
    const result = await api.loginWithGoogle(credential, mode === 'register' ? tournamentName.trim() : undefined);
    setLoading(false);
    if (result.ok === true) {
      onAuthenticated(result.data.token, result.data.tournament);
      return;
    }
    if (result.error === 'tournament_name_required') {
      setMode('register');
      setInfo(t.authTournamentName + '?');
      return;
    }
    showError(result.error);
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    if (!clientId || !window.google || !googleBtnRef.current || mode === 'forgot' || mode === 'reset') return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => { handleGoogleCredential(response.credential); },
    });
    // Google's button is a fixed-width iframe, so we measure our own full-width
    // container (matching the "Войти"/"Создать аккаунт" button above it) and
    // hand that pixel value to the widget — Google caps it at 400px.
    const width = Math.min(400, googleBtnRef.current.offsetWidth || 320);
    window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'filled_black', shape: 'pill', size: 'large', width });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const submitLogin = async () => {
    setError(null);
    setLoading(true);
    const result = await api.login(email.trim(), password);
    setLoading(false);
    if (result.ok === true) onAuthenticated(result.data.token, result.data.tournament);
    else showError(result.error);
  };

  const submitRegister = async () => {
    setError(null);
    setLoading(true);
    const result = await api.register(email.trim(), password, tournamentName.trim());
    setLoading(false);
    if (result.ok === true) onAuthenticated(result.data.token, result.data.tournament);
    else showError(result.error);
  };

  const submitForgot = async () => {
    setError(null);
    setLoading(true);
    const result = await api.forgotPassword(email.trim());
    setLoading(false);
    if (result.ok === true) {
      setInfo(t.authForgotSuccess as string);
    } else {
      showError(result.error);
    }
  };

  const submitReset = async () => {
    setError(null);
    if (newPassword !== confirmPassword) {
      setError(t.authPasswordMismatch as string);
      return;
    }
    setLoading(true);
    const result = await api.resetPassword(initialResetToken || '', newPassword);
    setLoading(false);
    if (result.ok === true) {
      setInfo(t.authResetSuccess as string);
      setMode('login');
    } else {
      showError(result.error);
    }
  };

  const inputClass = "w-full bg-slate-950 border border-slate-800 text-white rounded-2xl p-5 font-black outline-none focus:border-indigo-500 transition-colors shadow-inner text-sm";
  const labelClass = "text-[10px] font-black text-slate-600 uppercase tracking-widest ml-4";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bjj-gradient overflow-hidden">
      <LiquidBackground />
      <div className="relative z-10 bg-slate-900 border border-slate-800/80 w-full max-w-md rounded-[3rem] p-10 shadow-2xl">
        <h1 className="text-2xl font-black mb-8 text-white tracking-tight uppercase text-center">
          {mode === 'login' && t.authLoginTitle}
          {mode === 'register' && t.authRegisterTitle}
          {mode === 'forgot' && t.authForgotTitle}
          {mode === 'reset' && t.authResetTitle}
        </h1>

        {mode === 'forgot' && <p className="text-slate-500 text-sm mb-6 text-center">{t.authForgotSub}</p>}

        {error && <p className="mb-6 text-red-500 text-xs font-bold text-center">{error}</p>}
        {info && <p className="mb-6 text-emerald-500 text-xs font-bold text-center">{info}</p>}

        {(mode === 'login' || mode === 'register') && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className={labelClass}>{t.authEmail}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>{t.authPassword}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            </div>
            {mode === 'register' && (
              <div className="space-y-2">
                <label className={labelClass}>{t.authTournamentName}</label>
                <input value={tournamentName} onChange={e => setTournamentName(e.target.value)} className={inputClass} />
              </div>
            )}

            {mode === 'login' && (
              <div className="text-right">
                <button onClick={() => { setMode('forgot'); setError(null); setInfo(null); }} className="text-[11px] font-bold text-indigo-400 hover:text-white uppercase tracking-widest">
                  {t.authForgotPasswordLink}
                </button>
              </div>
            )}

            <button
              disabled={loading}
              onClick={mode === 'login' ? submitLogin : submitRegister}
              className="w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
            >
              {mode === 'login' ? t.authLoginButton : t.authRegisterButton}
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] font-black text-slate-600 uppercase">{t.authOr}</span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>

              <div className="w-full rounded-2xl overflow-hidden shadow-xl" ref={googleBtnRef} />
              {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <p className="text-center text-[10px] text-slate-700 uppercase tracking-widest">{t.authGoogleUnavailable}</p>
              )}
            </div>

            <p className="text-center text-xs text-slate-500">
              {mode === 'login' ? t.authSwitchToRegisterPrompt : t.authSwitchToLoginPrompt}{' '}
              <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setInfo(null); }} className="text-indigo-400 hover:text-white font-bold">
                {mode === 'login' ? t.authSwitchToRegister : t.authSwitchToLogin}
              </button>
            </p>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className={labelClass}>{t.authEmail}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            </div>
            <button disabled={loading} onClick={submitForgot} className="w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95 disabled:opacity-50">
              {t.authForgotSubmit}
            </button>
            <button onClick={() => { setMode('login'); setError(null); setInfo(null); }} className="w-full text-center text-xs text-slate-500 hover:text-white font-bold uppercase tracking-widest">
              {t.authBackToLogin}
            </button>
          </div>
        )}

        {mode === 'reset' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className={labelClass}>{t.authResetNewPassword}</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>{t.authResetConfirmPassword}</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
            </div>
            <button disabled={loading} onClick={submitReset} className="w-full py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] transition-all bg-indigo-600 text-white shadow-xl hover:bg-indigo-500 active:scale-95 disabled:opacity-50">
              {t.authResetSubmit}
            </button>
            <button onClick={() => { setMode('login'); setError(null); setInfo(null); }} className="w-full text-center text-xs text-slate-500 hover:text-white font-bold uppercase tracking-widest">
              {t.authBackToLogin}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
