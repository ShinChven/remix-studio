import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Fingerprint, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { beginPasskeyLogin, finishPasskeyLogin, verifyTwoFactorLogin } from '../api';
import { isPasskeySupported, serializeAssertionCredential, toPublicKeyRequestOptions } from '../lib/passkey';
import { Starfield } from '../components/Starfield';
import type { User } from '../types';


export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawNextUrl = searchParams.get('next') || '/';
  const nextUrl = rawNextUrl.startsWith('/') ? rawNextUrl : '/';

  const finishLogin = (nextUser: User) => {
    login(nextUser);
    if (nextUrl.startsWith('/')) {
      navigate(nextUrl);
      return;
    }
    window.location.href = nextUrl;
  };

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) {
      setError(oauthError);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isLoading && user) {
      if (nextUrl.startsWith('/')) {
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
      if (!res.ok) throw new Error(data.error || 'Login failed');

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
      setError(err.message || '2FA verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!isPasskeySupported()) {
      setError('This browser does not support passkeys.');
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
      setError(err.message || 'Passkey login failed');
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-black">
      <Starfield />

      <div className="relative z-10 max-w-md w-full p-8 rounded-[2.5rem] bg-white/10 border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex flex-col items-center backdrop-blur-sm backdrop-saturate-150 ring-1 ring-inset ring-white/10">





        <img src="/favicon.svg" alt="Remix Studio Logo" className="w-16 h-16 mb-6" />
        <h2 className="text-3xl font-bold text-center text-zinc-100 mb-2">
          {isTwoFactorStep ? 'Two-Factor Verification' : 'Welcome Back'}
        </h2>
        <p className="mb-8 text-center text-sm text-zinc-400">
          {isTwoFactorStep ? `Enter the 6-digit code for ${pendingEmail}.` : 'Sign in with your password or a saved passkey.'}
        </p>
        {error && (
          <div className="mb-6 w-full p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {isTwoFactorStep ? (
          <form onSubmit={handleTwoFactorSubmit} className="w-full space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Authentication code</label>
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
              Verify and Sign In
            </button>
            <button
              type="button"
              onClick={resetTwoFactorState}
              className="w-full py-3 rounded-xl border border-zinc-800 text-zinc-300 hover:border-zinc-700 transition-colors"
            >
              Back
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="w-full space-y-6">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all font-mono backdrop-blur-md"

                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
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
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>

            </form>

            <div className="my-6 flex w-full items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <div className="h-px flex-1 bg-zinc-800" />
              Or continue with
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
                Passkey
              </button>

              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 transition-all hover:bg-white/10 active:scale-[0.98] backdrop-blur-md"

              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </a>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
