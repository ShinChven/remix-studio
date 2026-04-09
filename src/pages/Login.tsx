import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { beginPasskeyLogin, finishPasskeyLogin, verifyTwoFactorLogin } from '../api';
import { isPasskeySupported, serializeAssertionCredential, toPublicKeyRequestOptions } from '../lib/passkey';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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

      login(data.user);
      navigate('/');
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
      login(data.user);
      navigate('/');
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
      login(result.user);
      navigate('/');
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col items-center">
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
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono tracking-[0.3em]"
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
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-zinc-100 hover:bg-white text-zinc-900 font-medium py-3 rounded-xl transition-colors shadow-lg disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
              </button>
            </form>

            <div className="my-6 flex w-full items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
              <div className="h-px flex-1 bg-zinc-800" />
              Or
              <div className="h-px flex-1 bg-zinc-800" />
            </div>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 transition-colors hover:border-zinc-700 disabled:opacity-50"
            >
              {passkeyLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
              Sign In With Passkey
            </button>

            <a
              href="https://github.com/ShinChven/remix-studio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-3 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-current"
              >
                <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.51v-1.8c-2.94.64-3.56-1.24-3.56-1.24-.48-1.2-1.16-1.52-1.16-1.52-.95-.65.07-.63.07-.63 1.05.08 1.6 1.08 1.6 1.08.94 1.6 2.46 1.14 3.06.87.1-.68.37-1.14.67-1.41-2.35-.27-4.82-1.17-4.82-5.23 0-1.16.41-2.1 1.08-2.84-.11-.27-.47-1.38.1-2.87 0 0 .88-.28 2.88 1.08a9.95 9.95 0 0 1 5.24 0c2-1.36 2.88-1.08 2.88-1.08.57 1.49.21 2.6.1 2.87.67.74 1.08 1.68 1.08 2.84 0 4.07-2.47 4.95-4.83 5.21.38.33.72.97.72 1.96v2.91c0 .28.19.61.73.51A10.5 10.5 0 0 0 12 1.5Z" />
              </svg>
              View Remix Studio on GitHub
            </a>
          </>
        )}
      </div>
    </div>
  );
}
