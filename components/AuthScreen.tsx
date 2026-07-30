
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

  const [logoError, setLogoError] = useState(false);
  const inputClass = "w-full px-5 py-3 rounded-xl bg-white/10 text-white placeholder-gray-400 text-sm outline-none focus:ring-2 focus:ring-white/30 transition-shadow";
  const primaryButtonClass = "w-full bg-white/10 text-white font-medium px-5 py-3 rounded-full shadow hover:bg-white/20 transition text-sm disabled:opacity-50";

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 bg-[#121212] overflow-hidden">
      <LiquidBackground />
      <div className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-r from-[#ffffff10] to-[#121212] backdrop-blur-sm border border-white/10 shadow-2xl p-8 flex flex-col items-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/20 mb-6 shadow-lg overflow-hidden shrink-0">
          {logoError ? (
            <span className="font-black text-white text-sm">BJJ</span>
          ) : (
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={() => setLogoError(true)} />
          )}
        </div>

        <h1 className="text-2xl font-semibold text-white mb-6 text-center">
          {mode === 'login' && t.authLoginTitle}
          {mode === 'register' && t.authRegisterTitle}
          {mode === 'forgot' && t.authForgotTitle}
          {mode === 'reset' && t.authResetTitle}
        </h1>

        {mode === 'forgot' && <p className="text-gray-400 text-sm mb-6 text-center">{t.authForgotSub}</p>}

        {error && <p className="mb-4 text-sm text-red-400 text-center w-full">{error}</p>}
        {info && <p className="mb-4 text-sm text-emerald-400 text-center w-full">{info}</p>}

        {(mode === 'login' || mode === 'register') && (
          <div className="flex flex-col w-full gap-4">
            <div className="w-full flex flex-col gap-3">
              <input placeholder={t.authEmail as string} type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
              <input placeholder={t.authPassword as string} type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
              {mode === 'register' && (
                <input placeholder={t.authTournamentName as string} value={tournamentName} onChange={e => setTournamentName(e.target.value)} className={inputClass} />
              )}
              {mode === 'login' && (
                <div className="text-right">
                  <button onClick={() => { setMode('forgot'); setError(null); setInfo(null); }} className="text-xs font-medium text-gray-400 hover:text-white">
                    {t.authForgotPasswordLink}
                  </button>
                </div>
              )}
            </div>

            <hr className="opacity-10" />

            <div>
              <button disabled={loading} onClick={mode === 'login' ? submitLogin : submitRegister} className={`${primaryButtonClass} mb-3`}>
                {mode === 'login' ? t.authLoginButton : t.authRegisterButton}
              </button>

              <div className="w-full rounded-full overflow-hidden shadow bg-gradient-to-b from-[#232526] to-[#2d2e30] mb-2" ref={googleBtnRef} />
              {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                <p className="text-center text-[10px] text-gray-500 uppercase tracking-widest mb-2">{t.authGoogleUnavailable}</p>
              )}

              <div className="w-full text-center mt-2">
                <span className="text-xs text-gray-400">
                  {mode === 'login' ? t.authSwitchToRegisterPrompt : t.authSwitchToLoginPrompt}{' '}
                  <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setInfo(null); }} className="underline text-white/80 hover:text-white">
                    {mode === 'login' ? t.authSwitchToRegister : t.authSwitchToLogin}
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="flex flex-col w-full gap-4">
            <input placeholder={t.authEmail as string} type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
            <button disabled={loading} onClick={submitForgot} className={primaryButtonClass}>
              {t.authForgotSubmit}
            </button>
            <button onClick={() => { setMode('login'); setError(null); setInfo(null); }} className="w-full text-center text-xs text-gray-400 hover:text-white font-medium">
              {t.authBackToLogin}
            </button>
          </div>
        )}

        {mode === 'reset' && (
          <div className="flex flex-col w-full gap-4">
            <input placeholder={t.authResetNewPassword as string} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
            <input placeholder={t.authResetConfirmPassword as string} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
            <button disabled={loading} onClick={submitReset} className={primaryButtonClass}>
              {t.authResetSubmit}
            </button>
            <button onClick={() => { setMode('login'); setError(null); setInfo(null); }} className="w-full text-center text-xs text-gray-400 hover:text-white font-medium">
              {t.authBackToLogin}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
