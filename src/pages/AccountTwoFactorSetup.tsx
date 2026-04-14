import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { enableTwoFactor, fetchCurrentUser, setupTwoFactor } from '../api';
import { User } from '../types';

export function AccountTwoFactorSetup() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupPassword, setSetupPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingSetup, setPendingSetup] = useState<{ secret: string; otpauthUri: string; expiresAt: number } | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      setLoading(true);
      try {
        const me = await fetchCurrentUser();
        if (!mounted) return;
        setUser(me);
      } catch (err: any) {
        if (!mounted) return;
        setError(err.message || t('accountTwoFactorSetup.errors.loadAccount'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadUser();
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const renderQrCode = async () => {
      if (!pendingSetup?.otpauthUri) {
        setQrCode('');
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(pendingSetup.otpauthUri, {
          width: 220,
          margin: 1,
          color: {
            dark: '#f8fafc',
            light: '#0a0a0a',
          },
        });

        if (!cancelled) setQrCode(dataUrl);
      } catch {
        if (!cancelled) setQrCode('');
      }
    };

    void renderQrCode();
    return () => {
      cancelled = true;
    };
  }, [pendingSetup]);

  const handleStartSetup = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSettingUp(true);

    try {
      const pending = await setupTwoFactor(setupPassword);
      setPendingSetup(pending);
      setVerificationCode('');
      setSuccess(t('accountTwoFactorSetup.success.secretCreated'));
    } catch (err: any) {
      setError(err.message || t('accountTwoFactorSetup.errors.prepareSetup'));
    } finally {
      setSettingUp(false);
    }
  };

  const handleEnable = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setEnabling(true);

    try {
      await enableTwoFactor(verificationCode);
      setPendingSetup(null);
      setQrCode('');
      setSetupPassword('');
      setVerificationCode('');
      setSuccess(t('accountTwoFactorSetup.success.enabled'));
      const me = await fetchCurrentUser();
      setUser(me);
    } catch (err: any) {
      setError(err.message || t('accountTwoFactorSetup.errors.enable'));
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link to="/account?tab=security" className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200">
              <ArrowLeft className="h-4 w-4" />
              {t('accountTwoFactorSetup.backToSecurity')}
            </Link>
            <h2 className="mt-3 text-2xl font-bold text-white">{t('accountTwoFactorSetup.title')}</h2>
            <p className="mt-2 text-sm text-neutral-400">
              {t('accountTwoFactorSetup.description', { email: user?.email || t('accountTwoFactorSetup.thisAccount') })}
            </p>
          </div>
          {user?.twoFactorEnabled && (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              {t('accountTwoFactorSetup.enabled')}
            </span>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {!user?.twoFactorEnabled && (
          <>
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{t('accountTwoFactorSetup.step1.title')}</h3>
                  <p className="text-sm text-neutral-400">
                    {user?.hasPassword ? t('accountTwoFactorSetup.step1.withPassword') : t('accountTwoFactorSetup.step1.noPassword')}
                  </p>
                </div>
              </div>

              <form onSubmit={handleStartSetup} className="mt-6 space-y-4">
                {user?.hasPassword && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-400">{t('accountTwoFactorSetup.currentPassword')}</label>
                    <input
                      type="password"
                      value={setupPassword}
                      onChange={(event) => setSetupPassword(event.target.value)}
                      className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                      required
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={settingUp}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {settingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  {t('accountTwoFactorSetup.step1.action')}
                </button>
              </form>
            </section>

            {pendingSetup && (
              <section className="rounded-3xl border border-blue-500/20 bg-blue-500/5 p-6">
                <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="flex flex-col items-center rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">{t('accountTwoFactorSetup.scanQr')}</p>
                    {qrCode ? (
                      <img
                        src={qrCode}
                        alt={t('accountTwoFactorSetup.qrAlt')}
                        className="h-[220px] w-[220px] rounded-xl border border-neutral-800 bg-black p-2"
                      />
                    ) : (
                      <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-sm text-neutral-500">
                        {t('accountTwoFactorSetup.qrUnavailable')}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">{t('accountTwoFactorSetup.step2.title')}</h3>
                    <p className="mt-2 text-sm text-neutral-400">
                      {t('accountTwoFactorSetup.step2.description')}
                    </p>
                    <p className="mt-4 break-all rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-sm text-blue-200">
                      {pendingSetup.secret}
                    </p>
                    <p className="mt-2 text-xs text-neutral-500">
                      {t('accountTwoFactorSetup.expiresAt', { time: new Date(pendingSetup.expiresAt).toLocaleTimeString() })}
                    </p>
                    <a
                      href={pendingSetup.otpauthUri}
                      className="mt-3 inline-flex text-sm text-blue-300 hover:text-blue-200"
                    >
                      {t('accountTwoFactorSetup.openOtpauth')}
                    </a>

                    <form onSubmit={handleEnable} className="mt-6 space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-400">{t('accountTwoFactorSetup.verificationCode')}</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={verificationCode}
                          onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50 font-mono tracking-[0.3em]"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={enabling}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {enabling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {t('accountTwoFactorSetup.enable')}
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
