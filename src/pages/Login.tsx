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

      login(data.token, data.user);
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
      login(data.token, data.user);
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
      login(result.token, result.user);
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
          </>
        )}
      </div>
    </div>
  );
}
