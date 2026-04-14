import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Loader2, ShieldCheck, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { beginPasskeyLogin, completeGoogleRegistration, finishPasskeyLogin, verifyTwoFactorLogin } from '../api';
import { isPasskeySupported, serializeAssertionCredential, toPublicKeyRequestOptions } from '../lib/passkey';
import { Starfield } from '../components/Starfield';
import type { User } from '../types';

function isClientRoutablePath(url: string) {
  if (!url.startsWith('/')) return false;

  const pathname = new URL(url, window.location.origin).pathname;
  if (pathname === '/authorize' || pathname === '/register' || pathname === '/token') {
    return false;
  }
  if (pathname.startsWith('/.well-known/') || pathname.startsWith('/mcp')) {
    return false;
  }

  return true;
}

export function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawNextUrl = searchParams.get('next') || '/';
  const nextUrl = rawNextUrl.startsWith('/') ? rawNextUrl : '/';
  const registerMode = searchParams.get('register') === '1';

  const finishLogin = (nextUser: User) => {
    login(nextUser);
    if (isClientRoutablePath(nextUrl)) {
      navigate(nextUrl, { replace: true });
      return;
    }
    window.location.replace(nextUrl);
  };

  useEffect(() => {
    const oauthError = searchParams.get('error');
    const inviteCodeParam = searchParams.get('inviteCode') || searchParams.get('invite') || '';

    if (oauthError) {
      setError(oauthError);
    }
    if (inviteCodeParam) {
      setInviteCode(inviteCodeParam.toUpperCase());
    }
    if (oauthError || inviteCodeParam) {
      const nextSearch = new URLSearchParams(searchParams);
      nextSearch.delete('error');
      nextSearch.delete('inviteCode');
      nextSearch.delete('invite');
      setSearchParams(nextSearch, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isLoading && user) {
      if (isClientRoutablePath(nextUrl)) {
        navigate(nextUrl, { replace: true });
      } else {
        window.location.replace(nextUrl);
      }
    }
  }, [isLoading, navigate, nextUrl, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('login.errors.loginFailed'));

      if (data.requiresTwoFactor) {
        setTwoFactorToken(data.tempToken);
        setPendingEmail(data.user?.email || email);
        setTwoFactorCode('');
        return;
      }

      finishLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await verifyTwoFactorLogin(twoFactorToken, twoFactorCode);
      finishLogin(data.user);
    } catch (err: any) {
      setError(err.message || t('login.errors.twoFactorFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!isPasskeySupported()) {
      setError(t('login.errors.passkeyNotSupported'));
      return;
    }

    setError('');
    setPasskeyLoading(true);

    try {
      const { options, flowToken } = await beginPasskeyLogin(email || undefined);
      const credential = await navigator.credentials.get({
        publicKey: toPublicKeyRequestOptions(options),
      });

      if (!credential) {
        throw new Error('Passkey login was cancelled.');
      }

      const result = await finishPasskeyLogin(flowToken, serializeAssertionCredential(credential as PublicKeyCredential));
      finishLogin(result.user);
    } catch (err: any) {
      setError(err.message || t('login.errors.passkeyFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const resetTwoFactorState = () => {
    setTwoFactorToken('');
    setTwoFactorCode('');
    setPendingEmail('');
  };

  const isTwoFactorStep = Boolean(twoFactorToken);
  const googleAuthUrl = `/api/auth/google?${new URLSearchParams({
    next: nextUrl,
    ...(inviteCode ? { inviteCode } : {}),
  }).toString()}`;

  const handleGoogleRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setRegisterLoading(true);

    try {
      const data = await completeGoogleRegistration(inviteCode.trim().toUpperCase());
      login(data.user);
      const destination = data.nextUrl || nextUrl;
      if (isClientRoutablePath(destination)) {
        navigate(destination, { replace: true });
      } else {
        window.location.replace(destination);
      }
    } catch (err: any) {
      setError(err.message || t('login.errors.registrationFailed'));
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-black">
      <Starfield />

      <div className="relative z-10 max-w-md w-full p-8 rounded-[2.5rem] bg-white/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col items-center backdrop-blur-sm backdrop-saturate-150 ring-1 ring-inset ring-white/10">
        <img src="/favicon.svg" alt="Remix Studio Logo" className="w-16 h-16 mb-6" />
        <h2 className="text-3xl font-bold text-center text-zinc-100 mb-2">
          {isTwoFactorStep ? t('login.twoFactorVerification') : registerMode ? t('login.completeRegistration') : t('login.welcomeBack')}
        </h2>
        <p className="mb-8 text-center text-sm text-zinc-400">
          {isTwoFactorStep
            ? t('login.twoFactorDescription', { email: pendingEmail })
            : registerMode
              ? t('login.registrationDescription')
              : t('login.signInWith')}
        </p>
        {error && (
          <div className="mb-6 w-full p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {isTwoFactorStep ? (
          <form onSubmit={handleTwoFactorSubmit} className="w-full space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t('login.authCode')}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-mono tracking-[0.3em] backdrop-blur-md"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 font-medium py-3 rounded-xl transition-colors shadow-lg disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              {t('login.verifyAndSignIn')}
            </button>
            <button
              type="button"
              onClick={resetTwoFactorState}
              className="w-full py-3 rounded-xl border border-zinc-800 text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              {t('login.back')}
            </button>
          </form>
        ) : registerMode ? (
          <form onSubmit={handleGoogleRegistration} className="w-full space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t('login.googleSignIn')}</label>
              <div className="w-full rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-zinc-400 backdrop-blur-md">
                {t('login.verifiedSuccessfully')}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">{t('login.inviteCode')}</label>
              <input
                type="text"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder={t('login.enterInviteCode')}
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-mono tracking-[0.2em] backdrop-blur-md"
                required
              />
              <p className="mt-2 text-xs text-zinc-500">{t('login.inviteCodeDescription')}</p>
            </div>
            <button
              type="submit"
              disabled={registerLoading}
              className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 font-semibold py-3.5 rounded-2xl transition-all active:scale-[0.98] shadow-lg disabled:opacity-50"
            >
              {registerLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ticket className="w-5 h-5" />}
              {t('login.finishRegistration')}
            </button>
            <a
              href={googleAuthUrl}
              className="block w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-center text-sm text-zinc-100 transition-all hover:bg-white/10"
            >
              {t('login.restartGoogle')}
            </a>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('login.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-mono backdrop-blur-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">{t('login.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-mono backdrop-blur-md"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 font-semibold py-3.5 rounded-2xl transition-all active:scale-[0.98] shadow-lg disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t('login.signIn')}
              </button>
            </form>

            <div className="my-6 flex w-full items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <div className="h-px flex-1 bg-zinc-800" />
              {t('login.orContinueWith')}
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <div className="w-full grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyLoading}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 transition-all hover:bg-white/10 active:scale-[0.98] disabled:opacity-50 backdrop-blur-md"
              >
                {passkeyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                {t('login.passkey')}
              </button>

              <a
                href={googleAuthUrl}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 transition-all hover:bg-white/10 active:scale-[0.98] backdrop-blur-md"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {t('login.google')}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
