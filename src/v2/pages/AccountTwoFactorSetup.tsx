import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { enableTwoFactor, fetchCurrentUser, setupTwoFactor } from '../../api';
import { Button, Icon, Text, TextField, useTheme } from '../../m3';
import type { User } from '../../types';
import { LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

/** Hex value of an M3 color role in the current scheme, for canvas-drawn graphics. */
function roleColor(role: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--md-sys-color-${role}`).trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function AccountTwoFactorSetup() {
  const { t } = useTranslation();
  const { resolvedMode, seed } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<{ secret: string; otpauthUri: string; expiresAt: number } | null>(null);
  const [qrCode, setQrCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const me = await fetchCurrentUser();
        if (mounted) setUser(me);
      } catch (err) {
        if (mounted) setError((err as Error).message || t('accountTwoFactorSetup.errors.loadAccount'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    if (!pending?.otpauthUri) {
      setQrCode('');
      return;
    }
    QRCode.toDataURL(pending.otpauthUri, {
      width: 220,
      margin: 1,
      color: { dark: roleColor('on-surface', '#1c1b1f'), light: roleColor('surface-container-lowest', '#ffffff') },
    })
      .then((url) => !cancelled && setQrCode(url))
      .catch(() => !cancelled && setQrCode(''));
    return () => {
      cancelled = true;
    };
  }, [pending, resolvedMode, seed]);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSettingUp(true);
    try {
      setPending(await setupTwoFactor(password));
      setCode('');
      setSuccess(t('accountTwoFactorSetup.success.secretCreated'));
    } catch (err) {
      setError((err as Error).message || t('accountTwoFactorSetup.errors.prepareSetup'));
    } finally {
      setSettingUp(false);
    }
  };

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setEnabling(true);
    try {
      await enableTwoFactor(code);
      setPending(null);
      setQrCode('');
      setPassword('');
      setCode('');
      setSuccess(t('accountTwoFactorSetup.success.enabled'));
      setUser(await fetchCurrentUser());
    } catch (err) {
      setError((err as Error).message || t('accountTwoFactorSetup.errors.enable'));
    } finally {
      setEnabling(false);
    }
  };

  if (loading) return <LoadingState minHeight={400} />;

  return (
    <Page width="narrow">
      <PageHeader
        backLink={{ to: '/account?tab=security', label: t('accountTwoFactorSetup.backToSecurity') }}
        title={t('accountTwoFactorSetup.title')}
        description={t('accountTwoFactorSetup.description', { email: user?.email || t('accountTwoFactorSetup.thisAccount') })}
        actions={user?.twoFactorEnabled ? <StatusPill tone="success" icon="verified_user">{t('accountTwoFactorSetup.enabled')}</StatusPill> : undefined}
      />
      <div className="flex flex-col gap-5">
        {error && (
          <div className="v2-notice" data-tone="error">
            <Icon name="error" />
            <Text variant="body-medium">{error}</Text>
          </div>
        )}
        {success && (
          <div className="v2-notice" data-tone="success">
            <Icon name="check_circle" />
            <Text variant="body-medium">{success}</Text>
          </div>
        )}
        {!user?.twoFactorEnabled && (
          <>
            <Section
              variant="card"
              icon={<span className="m3-typescale-title-medium">1</span>}
              title={t('accountTwoFactorSetup.step1.title')}
              description={user?.hasPassword ? t('accountTwoFactorSetup.step1.withPassword') : t('accountTwoFactorSetup.step1.noPassword')}
            >
              <form onSubmit={(e) => void start(e)} className="flex flex-col gap-4">
                {user?.hasPassword && (
                  <TextField variant="outlined" type="password" label={t('accountTwoFactorSetup.currentPassword')} value={password} onValueChange={setPassword} passwordToggle required fullWidth />
                )}
                <Button type="submit" variant="filled" icon="shield" loading={settingUp} className="self-start">
                  {t('accountTwoFactorSetup.step1.action')}
                </Button>
              </form>
            </Section>
            {pending && (
              <Section variant="card" icon={<span className="m3-typescale-title-medium">2</span>} title={t('accountTwoFactorSetup.step2.title')} description={t('accountTwoFactorSetup.step2.description')}>
                <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="v2-qr">
                    <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                      {t('accountTwoFactorSetup.scanQr')}
                    </Text>
                    {qrCode ? <img src={qrCode} alt={t('accountTwoFactorSetup.qrAlt')} width={220} height={220} /> : <div className="v2-qr__empty">{t('accountTwoFactorSetup.qrUnavailable')}</div>}
                  </div>
                  <div className="flex min-w-0 flex-col gap-3">
                    <code className="v2-secret">{pending.secret}</code>
                    <Text variant="body-small" className="text-on-surface-variant">
                      {t('accountTwoFactorSetup.expiresAt', { time: new Date(pending.expiresAt).toLocaleTimeString() })}
                    </Text>
                    <a href={pending.otpauthUri} className="v2-link self-start">
                      {t('accountTwoFactorSetup.openOtpauth')}
                    </a>
                    <form onSubmit={(e) => void enable(e)} className="flex flex-col gap-4 pt-2">
                      <TextField
                        variant="outlined"
                        label={t('accountTwoFactorSetup.verificationCode')}
                        inputMode="numeric"
                        maxLength={6}
                        showCounter={false}
                        value={code}
                        onValueChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                        inputClassName="v2-otp"
                        leadingIcon="pin"
                        required
                        fullWidth
                      />
                      <Button type="submit" variant="filled" icon="check_circle" loading={enabling} className="self-start" emphasized>
                        {t('accountTwoFactorSetup.enable')}
                      </Button>
                    </form>
                  </div>
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
