import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { beginPasskeyLogin, completeGoogleRegistration, finishPasskeyLogin, verifyTwoFactorLogin } from '../../api';
import { isPasskeySupported, serializeAssertionCredential, toPublicKeyRequestOptions } from '../../lib/passkey';
import { Button, Divider, Shape, Text, TextField, type MaterialShapeName } from '../../m3';
import type { User } from '../../types';
import { useAuth } from '../app/auth';
import { stripBase, withBase } from '../app/paths';

/** Paths the router can show; the OAuth and MCP endpoints need a full page load instead. */
function isClientRoutablePath(url: string) {
  if (!url.startsWith('/')) return false;
  const pathname = new URL(url, window.location.origin).pathname;
  if (pathname === '/authorize' || pathname === '/register' || pathname === '/token') return false;
  if (pathname.startsWith('/.well-known/') || pathname.startsWith('/mcp') || pathname.startsWith('/api/')) return false;
  return true;
}

const SHAPES: MaterialShapeName[] = ['cookie-9', 'clover-8', 'sunny', 'flower', 'soft-burst', 'puffy', 'cookie-12', 'clover-4'];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
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
  const [shape, setShape] = useState(0);
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawNext = searchParams.get('next') || '/';
  // The API layer builds `next` from the browser path, which carries the /v2 prefix.
  const nextUrl = rawNext.startsWith('/') ? stripBase(rawNext) : '/';
  const registerMode = searchParams.get('register') === '1';

  useEffect(() => {
    const timer = window.setInterval(() => setShape((i) => (i + 1) % SHAPES.length), 2400);
    return () => window.clearInterval(timer);
  }, []);

  const go = (destination: string) => {
    if (isClientRoutablePath(destination)) navigate(destination, { replace: true });
    else window.location.replace(destination);
  };

  const finishLogin = (nextUser: User) => {
    login(nextUser);
    go(nextUrl);
  };

  useEffect(() => {
    const oauthError = searchParams.get('error');
    const inviteParam = searchParams.get('inviteCode') || searchParams.get('invite') || '';
    if (oauthError) setError(oauthError);
    if (inviteParam) setInviteCode(inviteParam.toUpperCase());
    if (oauthError || inviteParam) {
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      next.delete('inviteCode');
      next.delete('invite');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isLoading && user) go(nextUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, nextUrl]);

  const handleSubmit = async (e: FormEvent) => {
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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await verifyTwoFactorLogin(twoFactorToken, twoFactorCode);
      finishLogin(data.user);
    } catch (err) {
      setError((err as Error).message || t('login.errors.twoFactorFailed'));
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
      const credential = await navigator.credentials.get({ publicKey: toPublicKeyRequestOptions(options) });
      if (!credential) throw new Error('Passkey login was cancelled.');
      const result = await finishPasskeyLogin(flowToken, serializeAssertionCredential(credential as PublicKeyCredential));
      finishLogin(result.user);
    } catch (err) {
      setError((err as Error).message || t('login.errors.passkeyFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleGoogleRegistration = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setRegisterLoading(true);
    try {
      const data = await completeGoogleRegistration(inviteCode.trim().toUpperCase());
      login(data.user);
      go(data.nextUrl ? stripBase(data.nextUrl) : nextUrl);
    } catch (err) {
      setError((err as Error).message || t('login.errors.registrationFailed'));
    } finally {
      setRegisterLoading(false);
    }
  };

  const isTwoFactorStep = Boolean(twoFactorToken);
  const googleAuthUrl = `/api/auth/google?${new URLSearchParams({
    next: isClientRoutablePath(nextUrl) ? withBase(nextUrl) : nextUrl,
    ...(inviteCode ? { inviteCode } : {}),
  }).toString()}`;

  return (
    <div className="v2-login">
      <div className="v2-login__art" aria-hidden>
        <Shape name={SHAPES[shape]} size="min(64vw, 520px)" morph="slow" className="v2-login__shape-a" />
        <Shape name={SHAPES[(shape + 3) % SHAPES.length]} size="min(36vw, 280px)" morph="slow" className="v2-login__shape-b" />
        <Shape name={SHAPES[(shape + 5) % SHAPES.length]} size="min(22vw, 160px)" morph="slow" className="v2-login__shape-c" />
      </div>

      <main className="v2-login__panel">
        <img src="/favicon.svg" alt="Remix Studio" width={56} height={56} />
        <div className="flex flex-col items-center gap-2 text-center">
          <Text as="h1" variant="headline-medium" emphasized>
            {isTwoFactorStep ? t('login.twoFactorVerification') : registerMode ? t('login.completeRegistration') : t('login.welcomeBack')}
          </Text>
          <Text variant="body-medium" className="text-on-surface-variant">
            {isTwoFactorStep
              ? t('login.twoFactorDescription', { email: pendingEmail })
              : registerMode
                ? t('login.registrationDescription')
                : t('login.signInWith')}
          </Text>
        </div>

        {error && (
          <div className="v2-error w-full" role="alert">
            <span className="material-symbols-outlined">error</span>
            <Text as="div" variant="body-medium">
              {error}
            </Text>
          </div>
        )}

        {isTwoFactorStep ? (
          <form onSubmit={handleTwoFactorSubmit} className="flex w-full flex-col gap-4">
            <TextField
              variant="outlined"
              label={t('login.authCode')}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              showCounter={false}
              value={twoFactorCode}
              onValueChange={(v) => setTwoFactorCode(v.replace(/\D/g, '').slice(0, 6))}
              inputClassName="v2-otp"
              leadingIcon="pin"
              required
              fullWidth
              autoFocus
            />
            <Button type="submit" variant="filled" size="md" icon="verified_user" loading={loading} fullWidth emphasized>
              {t('login.verifyAndSignIn')}
            </Button>
            <Button
              type="button"
              variant="text"
              fullWidth
              onClick={() => {
                setTwoFactorToken('');
                setTwoFactorCode('');
                setPendingEmail('');
              }}
            >
              {t('login.back')}
            </Button>
          </form>
        ) : registerMode ? (
          <form onSubmit={handleGoogleRegistration} className="flex w-full flex-col gap-4">
            <div className="v2-notice" data-tone="success">
              <span className="material-symbols-outlined">verified</span>
              <div className="flex flex-col gap-0.5">
                <Text variant="label-large" emphasized>
                  {t('login.googleSignIn')}
                </Text>
                <Text variant="body-small">{t('login.verifiedSuccessfully')}</Text>
              </div>
            </div>
            <TextField
              variant="outlined"
              label={t('login.inviteCode')}
              value={inviteCode}
              onValueChange={(v) => setInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder={t('login.enterInviteCode')}
              supportingText={t('login.inviteCodeDescription')}
              leadingIcon="confirmation_number"
              inputClassName="v2-otp"
              required
              fullWidth
            />
            <Button type="submit" variant="filled" size="md" icon="confirmation_number" loading={registerLoading} fullWidth emphasized>
              {t('login.finishRegistration')}
            </Button>
            <Button variant="outlined" href={googleAuthUrl} fullWidth icon={<GoogleMark />}>
              {t('login.restartGoogle')}
            </Button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
              <TextField
                variant="outlined"
                type="email"
                label={t('login.email')}
                leadingIcon="mail"
                value={email}
                onValueChange={setEmail}
                autoComplete="username"
                required
                fullWidth
              />
              <TextField
                variant="outlined"
                type="password"
                label={t('login.password')}
                leadingIcon="lock"
                value={password}
                onValueChange={setPassword}
                autoComplete="current-password"
                passwordToggle
                required
                fullWidth
              />
              <Button type="submit" variant="filled" size="md" loading={loading} fullWidth emphasized>
                {t('login.signIn')}
              </Button>
            </form>
            <div className="flex w-full items-center gap-3">
              <Divider className="flex-1" />
              <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                {t('login.orContinueWith')}
              </Text>
              <Divider className="flex-1" />
            </div>
            <div className="grid w-full grid-cols-2 gap-3">
              <Button variant="tonal" icon="fingerprint" loading={passkeyLoading} onClick={() => void handlePasskeyLogin()}>
                {t('login.passkey')}
              </Button>
              <Button variant="outlined" href={googleAuthUrl} icon={<GoogleMark />}>
                {t('login.google')}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
