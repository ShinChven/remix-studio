import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  beginPasskeyRegistration,
  disableTwoFactor,
  fetchAutoTagSettings,
  fetchCurrentUser,
  fetchLibraries,
  fetchProjects,
  fetchProviders,
  fetchPushSubscriptionStatus,
  fetchSecuritySettings,
  fetchStorageAnalysis,
  finishPasskeyRegistration,
  removePasskey,
  removePassword,
  sendTestPushNotification,
  updateAutoTagSettings,
  updatePassword,
} from '../../api';
import { isPasskeySupported, serializeAttestationCredential, toPublicKeyCreationOptions } from '../../lib/passkey';
import { disablePushNotifications, enablePushNotifications, getCurrentPushSubscription, getPushSupport } from '../../lib/push-notifications';
import { Avatar, Button, ButtonGroup, Dialog, Icon, LinearProgress, Select, Shape, Switch, Tab, Tabs, Text, TextField, useSnackbar, useTheme, type ThemeMode } from '../../m3';
import { AUTO_TAG_CONCURRENCY_LIMIT, providerAcceptsImageInput, type AutoTagSettings, type Provider, type SecuritySettings, type StorageAnalysis, type User } from '../../types';
import { useAuth } from '../app/auth';
import { MediaDevicesPanel } from '../components/media-share/MediaDevicesPanel';
import { useOpenThemeEditor } from '../shell/ThemeEditorContext';
import { setModeWithReveal, useUiPrefs } from '../theme/prefs';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { NumberField } from '../ui/NumberField';
import { ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatTile, StatusPill, type Tone } from '../ui/Stat';

type AccountTab = 'overview' | 'storage' | 'security' | 'preferences' | 'devices';
const ACCOUNT_TABS: AccountTab[] = ['overview', 'storage', 'security', 'preferences', 'devices'];
const isAccountTab = (value: string | null): value is AccountTab => value !== null && ACCOUNT_TABS.includes(value as AccountTab);

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
];

const STORAGE_TONES: Record<string, { tone: Tone; color: string; icon: string }> = {
  projects: { tone: 'primary', color: 'var(--md-sys-color-primary)', icon: 'play_circle' },
  album: { tone: 'secondary', color: 'var(--md-sys-color-secondary)', icon: 'photo_library' },
  workflow: { tone: 'success', color: 'var(--v2-color-success)', icon: 'account_tree' },
  orphans: { tone: 'warning', color: 'var(--v2-color-warning)', icon: 'help' },
  libraries: { tone: 'tertiary', color: 'var(--md-sys-color-tertiary)', icon: 'folder' },
  archives: { tone: 'secondary', color: 'var(--md-sys-color-on-secondary-container)', icon: 'folder_zip' },
  trash: { tone: 'error', color: 'var(--md-sys-color-error)', icon: 'delete' },
  other: { tone: 'neutral', color: 'var(--md-sys-color-outline)', icon: 'hard_drive' },
};
const storageTone = (id: string) => STORAGE_TONES[id] ?? STORAGE_TONES.other;

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function Notice({ tone, children, action }: { tone: 'success' | 'error' | 'warning' | 'info'; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="v2-notice" data-tone={tone}>
      <Icon name={tone === 'success' ? 'check_circle' : tone === 'info' ? 'info' : 'error'} />
      <Text as="div" variant="body-medium" className="flex-1">
        {children}
      </Text>
      {action}
    </div>
  );
}

function NotificationPreferences() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const support = useMemo(() => getPushSupport(), []);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(support === 'supported');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(() => support === 'supported' && Notification.permission === 'denied');

  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    (async () => {
      try {
        const subscription = await getCurrentPushSubscription();
        if (!subscription || Notification.permission !== 'granted') {
          if (!cancelled) setEnabled(false);
          return;
        }
        const { subscribed } = await fetchPushSubscriptionStatus(subscription.endpoint);
        if (!cancelled) setEnabled(subscribed);
      } catch {
        if (!cancelled) setEnabled(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [support]);

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const result = await enablePushNotifications();
        if (result === 'denied') {
          setDenied(Notification.permission === 'denied');
          snackbar.show(t('account.preferences.notifications.permissionDenied'));
          return;
        }
        setDenied(false);
        setEnabled(true);
        snackbar.show(t('account.preferences.notifications.enabled'));
      } else {
        await disablePushNotifications();
        setEnabled(false);
        snackbar.show(t('account.preferences.notifications.disabled'));
      }
    } catch (error) {
      snackbar.show((error as Error)?.message || t('account.preferences.notifications.error'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const { delivered } = await sendTestPushNotification();
      snackbar.show(delivered > 0 ? t('account.preferences.notifications.testSent') : t('account.preferences.notifications.testFailed'));
    } catch (error) {
      snackbar.show((error as Error)?.message || t('account.preferences.notifications.testFailed'));
    } finally {
      setBusy(false);
    }
  };

  const notice =
    support === 'needs-install'
      ? t('account.preferences.notifications.needsInstall')
      : support === 'unsupported'
        ? t('account.preferences.notifications.unsupported')
        : denied
          ? t('account.preferences.notifications.blocked')
          : null;

  return (
    <Section variant="card" icon={<Icon name="notifications" />} title={t('account.preferences.notifications.title')} description={t('account.preferences.notifications.description')}>
      {notice && <Notice tone="warning">{notice}</Notice>}
      {support === 'supported' && (
        <Switch
          label={t('account.preferences.notifications.projectQueueDone')}
          supportingText={t('account.preferences.notifications.projectQueueDoneDescription')}
          checked={enabled}
          disabled={busy || loading}
          onChange={(e) => void toggle(e.target.checked)}
        />
      )}
      {support === 'supported' && enabled && (
        <Button variant="tonal" icon="send" loading={busy} onClick={() => void test()} className="self-start">
          {t('account.preferences.notifications.sendTest')}
        </Button>
      )}
    </Section>
  );
}

const textModelsOf = (provider: Provider) => provider.models.filter((model) => model.category === 'text');

function AutoTagPreferences() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [saved, setSaved] = useState<AutoTagSettings | null>(null);
  const [draft, setDraft] = useState<AutoTagSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [settings, all] = await Promise.all([fetchAutoTagSettings(), fetchProviders()]);
      setProviders(all.filter((p) => providerAcceptsImageInput(p.type) && textModelsOf(p).length > 0));
      setSaved(settings);
      setDraft(settings);
    } catch (error) {
      setLoadError((error as Error)?.message || t('account.preferences.autoTag.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const provider = providers.find((p) => p.id === draft?.providerId) || null;
  const models = provider ? textModelsOf(provider) : [];
  const dirty = Boolean(draft && saved && (draft.providerId !== saved.providerId || draft.modelConfigId !== saved.modelConfigId || draft.concurrencyLimit !== saved.concurrencyLimit));
  const canSave = dirty && !saving && Boolean(draft && (!draft.providerId || draft.modelConfigId));

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    try {
      const next = await updateAutoTagSettings(draft);
      setSaved(next);
      setDraft(next);
      snackbar.show(t('account.preferences.autoTag.saved'));
    } catch (error) {
      snackbar.show((error as Error)?.message || t('account.preferences.autoTag.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section variant="card" icon={<Icon name="sell" />} title={t('account.preferences.autoTag.title')} description={t('account.preferences.autoTag.description')}>
      {loading ? (
        <LoadingState minHeight={120} />
      ) : loadError || !draft ? (
        <ErrorState message={loadError || t('account.preferences.autoTag.loadFailed')} onRetry={() => void load()} retryLabel={t('account.preferences.autoTag.retry')} />
      ) : (
        <>
          {providers.length === 0 && (
            <Notice
              tone="warning"
              action={
                <Button variant="text" size="xs" href="/providers">
                  {t('account.preferences.autoTag.manageProviders')}
                </Button>
              }
            >
              {t('account.preferences.autoTag.noVisionProviders')}
            </Notice>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              variant="outlined"
              label={t('account.preferences.autoTag.provider')}
              value={draft.providerId ?? ''}
              disabled={providers.length === 0}
              onChange={(providerId) => {
                const next = providers.find((p) => p.id === providerId);
                setDraft((current) => current && { ...current, providerId: next?.id ?? null, modelConfigId: next ? textModelsOf(next)[0]?.id ?? null : null });
              }}
              options={[{ value: '', label: t('account.preferences.autoTag.off') }, ...providers.map((p) => ({ value: p.id, label: p.name }))]}
              fullWidth
            />
            <Select
              variant="outlined"
              label={t('account.preferences.autoTag.model')}
              placeholder={t('account.preferences.autoTag.selectModel')}
              value={draft.modelConfigId ?? null}
              disabled={!provider}
              onChange={(modelConfigId) => setDraft((current) => current && { ...current, modelConfigId: modelConfigId || null })}
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              fullWidth
            />
          </div>
          <NumberField
            label={t('account.preferences.autoTag.concurrencyLimit')}
            supportingText={t('account.preferences.autoTag.concurrencyLimitDescription', { min: AUTO_TAG_CONCURRENCY_LIMIT.min, max: AUTO_TAG_CONCURRENCY_LIMIT.max })}
            value={draft.concurrencyLimit}
            onValueChange={(concurrencyLimit) => setDraft((current) => current && { ...current, concurrencyLimit })}
            min={AUTO_TAG_CONCURRENCY_LIMIT.min}
            max={AUTO_TAG_CONCURRENCY_LIMIT.max}
            integer
            stepper
            className="max-w-xs"
          />
          <Button variant="filled" icon="check_circle" loading={saving} disabled={!canSave} onClick={() => void save()} className="self-start">
            {t('account.preferences.autoTag.save')}
          </Button>
        </>
      )}
    </Section>
  );
}

export function Account() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();
  const theme = useTheme();
  const prefs = useUiPrefs();
  const openThemeEditor = useOpenThemeEditor();
  const [user, setUser] = useState<User | null>(null);
  const [storage, setStorage] = useState<StorageAnalysis | null>(null);
  const [counts, setCounts] = useState<{ projects: number; libraries: number; providers: number } | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [removePasswordInput, setRemovePasswordInput] = useState('');
  const [removingPassword, setRemovingPassword] = useState(false);
  const [showRemovePassword, setShowRemovePassword] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState('');
  const [savingPasskey, setSavingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [passkeyToRemove, setPasskeyToRemove] = useState<{ id: string; name: string } | null>(null);
  const [tfaPassword, setTfaPassword] = useState('');
  const [tfaCode, setTfaCode] = useState('');
  const [tfaError, setTfaError] = useState('');
  const [tfaSuccess, setTfaSuccess] = useState('');
  const [disablingTfa, setDisablingTfa] = useState(false);
  const [activeTab, setActiveTab] = useState<AccountTab>(() => {
    const tab = searchParams.get('tab');
    return isAccountTab(tab) ? tab : 'overview';
  });

  const tierNames: Record<number, string> = useMemo(
    () => ({
      [5 * 1024 ** 3]: t('account.storage.tierFree'),
      [100 * 1024 ** 3]: t('account.storage.tierProfessional'),
      [500 * 1024 ** 3]: t('account.storage.tierPremium'),
    }),
    [t],
  );
  const formatTier = useCallback(
    (limit?: number) => {
      if (!limit) return t('account.storage.tierCustom');
      const match = Object.keys(tierNames).find((k) => Math.abs(Number(k) - limit) < 1000);
      return match ? tierNames[Number(match)] : t('account.storage.tierCustom');
    },
    [t, tierNames],
  );

  useEffect(() => {
    const tab = searchParams.get('tab');
    const normalized = isAccountTab(tab) ? tab : 'overview';
    if (normalized !== activeTab) setActiveTab(normalized);
    if (tab !== normalized) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', normalized);
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setUserLoading(true);
      setUserLoadError('');
      try {
        const me = await fetchCurrentUser();
        if (mounted) setUser(me);
      } catch (error) {
        if (mounted) setUserLoadError((error as Error).message || t('account.errorUnavailableDesc'));
      } finally {
        if (mounted) setUserLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [t]);

  useEffect(() => {
    if (!user || activeTab !== 'overview' || overviewLoaded || overviewLoading) return;
    (async () => {
      setOverviewLoading(true);
      setOverviewError('');
      try {
        const [projects, libraries, providers] = await Promise.all([fetchProjects(1, 1), fetchLibraries(1, 1), fetchProviders()]);
        setCounts({ projects: projects.total, libraries: libraries.total, providers: providers.length });
        setOverviewLoaded(true);
      } catch (error) {
        setOverviewError((error as Error).message || t('account.overview.errorTitle'));
      } finally {
        setOverviewLoading(false);
      }
    })();
  }, [activeTab, overviewLoaded, overviewLoading, user, t]);

  useEffect(() => {
    if (!user || activeTab !== 'storage' || storageLoaded || storageLoading) return;
    (async () => {
      setStorageLoading(true);
      setStorageError('');
      try {
        setStorage(await fetchStorageAnalysis({ includeProjects: false }));
        setStorageLoaded(true);
      } catch (error) {
        setStorageError((error as Error).message || t('account.storage.errorTitle'));
      } finally {
        setStorageLoading(false);
      }
    })();
  }, [activeTab, storageLoaded, storageLoading, user, t]);

  useEffect(() => {
    if (!user || activeTab !== 'security' || securityLoaded || securityLoading) return;
    (async () => {
      setSecurityLoading(true);
      setSecurityError('');
      try {
        setSecurity(await fetchSecuritySettings());
        setSecurityLoaded(true);
      } catch (error) {
        setSecurityError((error as Error).message || t('account.security.errorTitle'));
      } finally {
        setSecurityLoading(false);
      }
    })();
  }, [activeTab, securityLoaded, securityLoading, user, t]);

  const usagePercent = storage?.limit ? Math.min(100, (storage.totalSize / storage.limit) * 100) : 0;

  const changeTab = (tab: AccountTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const refreshSecurity = async () => {
    setSecurity(await fetchSecuritySettings());
    setSecurityLoaded(true);
    setUser(await fetchCurrentUser());
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword.length < 8) return setPasswordError(t('account.security.errors.passwordLength'));
    if (newPassword !== confirmPassword) return setPasswordError(t('account.security.errors.passwordMatch'));
    setSavingPassword(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t('account.security.success.passwordUpdated'));
    } catch (error) {
      setPasswordError((error as Error).message || t('account.security.errors.passwordUpdateFailed'));
    } finally {
      setSavingPassword(false);
    }
  };

  const doRemovePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    setRemovingPassword(true);
    try {
      await removePassword(removePasswordInput);
      setRemovePasswordInput('');
      setShowRemovePassword(false);
      setPasswordSuccess(t('account.security.success.passwordRemoved'));
      setUser(await fetchCurrentUser());
    } catch (error) {
      setPasswordError((error as Error).message || t('account.security.errors.passwordRemoveFailed'));
    } finally {
      setRemovingPassword(false);
    }
  };

  const registerPasskey = async () => {
    if (!isPasskeySupported()) return setPasskeyError(t('account.security.errors.passkeyNotSupported'));
    setPasskeyError('');
    setPasskeySuccess('');
    setSavingPasskey(true);
    try {
      const { options, flowToken } = await beginPasskeyRegistration(passkeyName.trim() || t('account.security.defaultPasskeyName'));
      const credential = await navigator.credentials.create({ publicKey: toPublicKeyCreationOptions(options) });
      if (!credential) throw new Error(t('account.security.errors.passkeyCancelled'));
      await finishPasskeyRegistration(flowToken, serializeAttestationCredential(credential as PublicKeyCredential));
      setPasskeyName('');
      setPasskeySuccess(t('account.security.success.passkeyAdded'));
      await refreshSecurity();
    } catch (error) {
      setPasskeyError((error as Error).message || t('account.security.errors.passkeyRegisterFailed'));
    } finally {
      setSavingPasskey(false);
    }
  };

  const disableTfa = async (event: FormEvent) => {
    event.preventDefault();
    setTfaError('');
    setTfaSuccess('');
    setDisablingTfa(true);
    try {
      await disableTwoFactor(tfaPassword, tfaCode);
      setTfaPassword('');
      setTfaCode('');
      setTfaSuccess(t('account.security.success.twoFactorDisabled'));
      await refreshSecurity();
    } catch (error) {
      setTfaError((error as Error).message || t('account.security.errors.twoFactorDisableFailed'));
    } finally {
      setDisablingTfa(false);
    }
  };

  if (userLoading) return <LoadingState minHeight={400} />;
  if (!user) {
    return (
      <Page>
        <ErrorState message={`${t('account.errorUnavailable')} — ${userLoadError || t('account.errorUnavailableDesc')}`} />
      </Page>
    );
  }

  const overviewLinks = [
    { to: '/projects', icon: 'play_circle', label: t('account.overview.projects'), value: counts?.projects ?? 0, cta: t('account.overview.openProjects'), tone: 'primary' as Tone },
    { to: '/libraries', icon: 'folder', label: t('account.overview.libraries'), value: counts?.libraries ?? 0, cta: t('account.overview.openLibraries'), tone: 'tertiary' as Tone },
    { to: '/providers', icon: 'key', label: t('account.overview.providers'), value: counts?.providers ?? 0, cta: t('account.overview.manageProviders'), tone: 'secondary' as Tone },
  ];

  return (
    <Page width="default">
      <PageHeader size="large" title={t('account.title')} description={t('account.description')}>
        <Tabs value={activeTab} onChange={(v) => changeTab(v as AccountTab)} scrollable variant="secondary">
          <Tab value="overview" label={t('account.tabs.overview')} icon="person" inlineIcon />
          <Tab value="storage" label={t('account.tabs.storage')} icon="hard_drive" inlineIcon />
          <Tab value="security" label={t('account.tabs.security')} icon="shield" inlineIcon />
          <Tab value="preferences" label={t('account.tabs.preferences')} icon="tune" inlineIcon />
          <Tab value="devices" label={t('mediaShare.tab')} icon="tv" inlineIcon />
        </Tabs>
      </PageHeader>

      {activeTab === 'devices' && <MediaDevicesPanel />}

      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6">
          <section className="v2-profile-hero">
            <span className="v2-profile-hero__avatar" aria-hidden>
              <Shape name="cookie-12" size={96} className="v2-profile-hero__shape" />
              <Avatar name={user.email} size={64} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Text variant="label-medium" className="uppercase tracking-widest opacity-75">
                {t('account.overview.profile')}
              </Text>
              <Text as="h2" variant="headline-small" emphasized className="truncate">
                {user.email}
              </Text>
              <div className="flex flex-wrap gap-2">
                <StatusPill tone="primary">{user.role === 'admin' ? t('account.overview.administrator') : t('account.overview.user')}</StatusPill>
                <StatusPill>{t('account.overview.plan', { tier: formatTier(user.storageLimit) })}</StatusPill>
              </div>
              <Text variant="body-small" className="opacity-75">
                {t('account.overview.memberSince', { date: new Date(user.createdAt).toLocaleDateString() })}
              </Text>
            </div>
            <Button variant="tonal" icon="logout" className="v2-button-danger" onClick={() => setShowSignOut(true)}>
              {t('account.overview.signOut')}
            </Button>
          </section>
          {overviewLoading && !overviewLoaded ? (
            <LoadingState minHeight={200} />
          ) : overviewError ? (
            <ErrorState
              message={`${t('account.overview.errorTitle')}: ${overviewError}`}
              onRetry={() => {
                setOverviewLoaded(false);
                setOverviewError('');
              }}
              retryLabel={t('account.overview.retry')}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {overviewLinks.map((link) => (
                <Link key={link.to} to={link.to} className="v2-overview-link m3-focus-ring" data-tone={link.tone}>
                  <StatTile icon={link.icon} label={link.label} value={link.value} tone={link.tone} hint={link.cta} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'storage' &&
        (storageLoading && !storageLoaded ? (
          <LoadingState minHeight={320} />
        ) : storageError || !storage ? (
          <ErrorState
            message={storageError || t('account.storage.errorTitle')}
            onRetry={() => {
              setStorageLoaded(false);
              setStorageError('');
            }}
            retryLabel={t('account.storage.retry')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <Section variant="card" icon={<Icon name="hard_drive" />} title={t('account.storage.title')} description={t('account.storage.description')}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <Text variant="label-medium" className="uppercase tracking-widest text-on-surface-variant">
                    {t('account.storage.capacityOverview')}
                  </Text>
                  <Text variant="body-medium">{t('account.storage.capacityDesc', { percent: usagePercent.toFixed(1) })}</Text>
                </div>
                <Text variant="headline-small" emphasized>
                  {formatBytes(storage.totalSize)} <span className="m3-typescale-title-small text-on-surface-variant">/ {formatBytes(storage.limit)}</span>
                </Text>
              </div>
              <LinearProgress value={usagePercent} thickness={8} shape="wavy" aria-label={t('account.storage.usage')} className={usagePercent >= 90 ? 'v2-progress-error' : usagePercent >= 70 ? 'v2-progress-warning' : undefined} />
              <div className="v2-storage-bar" aria-hidden>
                {storage.categories.map((c) => (
                  <span key={c.id} style={{ flexGrow: Math.max(c.size, 0.0001), background: storageTone(c.id).color }} title={`${c.name} · ${formatBytes(c.size)}`} />
                ))}
              </div>
              <div className="v2-stat-grid">
                <StatTile label={t('account.storage.consumption')} value={formatBytes(storage.totalSize)} />
                <StatTile label={t('account.storage.planLimit')} value={formatBytes(storage.limit)} />
                <StatTile label={t('account.storage.usage')} value={`${usagePercent.toFixed(1)}%`} tone={usagePercent >= 90 ? 'error' : usagePercent >= 70 ? 'warning' : 'primary'} />
                <StatTile label={t('account.storage.tier')} value={tierNames[storage.limit] || t('account.storage.tierCustom')} />
              </div>
            </Section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {storage.categories.map((category) => {
                const meta = storageTone(category.id);
                const subs = category.subCategories?.filter((s) => s.id !== 'drafts');
                return (
                  <div key={category.id} className="v2-storage-category">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-3">
                        <span className="v2-storage-category__icon" style={{ color: meta.color }}>
                          <Icon name={meta.icon} />
                        </span>
                        <Text as="span" variant="title-small" emphasized>
                          {category.name}
                        </Text>
                      </span>
                      <Text as="span" variant="label-large" emphasized>
                        {formatBytes(category.size)}
                      </Text>
                    </div>
                    <Text variant="body-small" className="text-on-surface-variant">
                      {storage.totalSize > 0 ? t('account.storage.ofUsed', { percent: ((category.size / storage.totalSize) * 100).toFixed(1) }) : t('account.storage.noUsage')}
                    </Text>
                    {subs && subs.length > 0 && (
                      <div className="v2-storage-category__subs">
                        {subs.map((sub) => (
                          <div key={sub.id}>
                            <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                              {sub.name}
                            </Text>
                            <Text variant="label-large">{formatBytes(sub.size)}</Text>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Section variant="tonal" icon={<Icon name="bolt" />} title={t('account.storage.optimization')}>
              <RowList>
                <Row
                  to="/projects"
                  lead={<Icon name="delete" className="text-error" />}
                  title={t('account.storage.recycleBin')}
                  meta={t('account.storage.recycleBinDesc', { size: formatBytes(storage.categories.find((c) => c.id === 'trash')?.size || 0) })}
                  actions={<Icon name="chevron_right" className="m3-mirror-rtl" />}
                />
                <Row to="/projects" lead={<Icon name="folder" />} title={t('account.storage.projectReview')} meta={t('account.storage.projectReviewDesc')} actions={<Icon name="chevron_right" className="m3-mirror-rtl" />} />
              </RowList>
            </Section>
          </div>
        ))}

      {activeTab === 'security' &&
        (securityLoading && !securityLoaded ? (
          <LoadingState minHeight={320} />
        ) : securityError || !security ? (
          <ErrorState
            message={securityError || t('account.security.errorTitle')}
            onRetry={() => {
              setSecurityLoaded(false);
              setSecurityError('');
            }}
            retryLabel={t('account.security.retry')}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <Section
              variant="card"
              icon={<Icon name="password" />}
              title={t('account.security.passwordTitle')}
              description={user.hasPassword ? t('account.security.passwordDescRotate') : t('account.security.passwordDescSet')}
            >
              <form onSubmit={(e) => void submitPassword(e)} className="flex flex-col gap-4">
                {user.hasPassword && (
                  <TextField variant="outlined" type="password" label={t('account.security.currentPassword')} value={currentPassword} onValueChange={setCurrentPassword} passwordToggle required fullWidth autoComplete="current-password" />
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField variant="outlined" type="password" label={t('account.security.newPassword')} value={newPassword} onValueChange={setNewPassword} minLength={8} passwordToggle required fullWidth autoComplete="new-password" />
                  <TextField variant="outlined" type="password" label={t('account.security.confirmNewPassword')} value={confirmPassword} onValueChange={setConfirmPassword} minLength={8} passwordToggle required fullWidth autoComplete="new-password" />
                </div>
                {passwordError && <Notice tone="error">{passwordError}</Notice>}
                {passwordSuccess && <Notice tone="success">{passwordSuccess}</Notice>}
                <Button type="submit" variant="filled" icon="shield" loading={savingPassword} className="self-start">
                  {user.hasPassword ? t('account.security.updatePassword') : t('account.security.setPassword')}
                </Button>
              </form>
              {user.hasPassword && security.passkeys.length > 0 && (
                <div className="v2-divider-row">
                  <div className="min-w-0">
                    <Text variant="label-large" emphasized>
                      {t('account.security.goPasswordless')}
                    </Text>
                    <Text variant="body-small" className="text-on-surface-variant">
                      {t('account.security.goPasswordlessDesc')}
                    </Text>
                  </div>
                  <Button variant="tonal" className="v2-button-danger" onClick={() => setShowRemovePassword(true)}>
                    {t('account.security.removePassword')}
                  </Button>
                </div>
              )}
            </Section>

            <Section
              variant="card"
              icon={<Icon name="fingerprint" />}
              title={t('account.security.passkeysTitle')}
              description={t('account.security.passkeysDesc')}
              actions={<StatusPill>{t('account.security.registered', { count: security.passkeys.length })}</StatusPill>}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <TextField variant="outlined" label={t('account.security.placeholder')} value={passkeyName} onValueChange={setPasskeyName} className="flex-1" fullWidth />
                <Button variant="filled" icon="fingerprint" loading={savingPasskey} onClick={() => void registerPasskey()} size="md">
                  {t('account.security.addPasskey')}
                </Button>
              </div>
              {passkeyError && <Notice tone="error">{passkeyError}</Notice>}
              {passkeySuccess && <Notice tone="success">{passkeySuccess}</Notice>}
              {security.passkeys.length === 0 ? (
                <Text variant="body-medium" className="v2-dashed-note">
                  {t('account.security.noPasskeys')}
                </Text>
              ) : (
                <RowList>
                  {security.passkeys.map((passkey) => (
                    <Row
                      key={passkey.id}
                      lead={<Icon name="fingerprint" />}
                      title={passkey.name}
                      meta={`${t('account.security.added', { date: new Date(passkey.createdAt).toLocaleString() })}${passkey.lastUsedAt ? ` • ${t('account.security.lastUsed', { date: new Date(passkey.lastUsedAt).toLocaleString() })}` : ''}`}
                      actions={
                        <Button variant="tonal" size="xs" icon="delete" className="v2-button-danger" loading={removingPasskeyId === passkey.id} onClick={() => setPasskeyToRemove({ id: passkey.id, name: passkey.name })}>
                          {t('account.security.remove')}
                        </Button>
                      }
                    />
                  ))}
                </RowList>
              )}
            </Section>

            <Section
              variant="card"
              icon={<Icon name="verified_user" />}
              title={t('account.security.twoFactorTitle')}
              description={t('account.security.twoFactorDesc')}
              actions={
                <StatusPill tone={security.twoFactorEnabled ? 'success' : 'neutral'}>{security.twoFactorEnabled ? t('account.security.enabled') : t('account.security.disabled')}</StatusPill>
              }
            >
              {tfaError && <Notice tone="error">{tfaError}</Notice>}
              {tfaSuccess && <Notice tone="success">{tfaSuccess}</Notice>}
              {!security.twoFactorEnabled ? (
                <div className="flex flex-col items-start gap-3">
                  <Text variant="body-medium" className="text-on-surface-variant">
                    {t('account.security.twoFactorSetupDesc')}
                  </Text>
                  {security.pendingTwoFactorSetup && <Notice tone="warning">{t('account.security.twoFactorSetupPending')}</Notice>}
                  <Button variant="filled" icon="shield" href="/account/security/2fa">
                    {t('account.security.openTwoFactor')}
                  </Button>
                </div>
              ) : (
                <form onSubmit={(e) => void disableTfa(e)} className="v2-danger-zone">
                  <div className="grid gap-4 md:grid-cols-2">
                    {user.hasPassword && (
                      <TextField variant="outlined" type="password" label={t('account.security.currentPassword')} value={tfaPassword} onValueChange={setTfaPassword} passwordToggle required fullWidth />
                    )}
                    <TextField
                      variant="outlined"
                      label={t('account.security.authCode')}
                      inputMode="numeric"
                      maxLength={6}
                      showCounter={false}
                      value={tfaCode}
                      onValueChange={(v) => setTfaCode(v.replace(/\D/g, '').slice(0, 6))}
                      inputClassName="v2-otp"
                      required
                      fullWidth
                    />
                  </div>
                  <Button type="submit" variant="filled" icon="shield" loading={disablingTfa} className="v2-button-danger self-start">
                    {t('account.security.disableTwoFactor')}
                  </Button>
                </form>
              )}
            </Section>
          </div>
        ))}

      {activeTab === 'preferences' && (
        <div className="flex flex-col gap-6">
          <Section variant="card" icon={<Icon name="language" />} title={t('account.preferences.language')} description={t('account.preferences.languageDescription')}>
            <Select
              variant="outlined"
              label={t('account.preferences.selectLanguage')}
              value={LANGUAGES.some((l) => l.code === i18n.language) ? i18n.language : (i18n.resolvedLanguage ?? 'en')}
              onChange={(code) => void i18n.changeLanguage(code)}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              className="max-w-sm"
              fullWidth
            />
          </Section>

          <Section
            variant="card"
            icon={<Icon name="palette" />}
            title={t('account.preferences.theme')}
            description={t('account.preferences.themeDescription')}
            actions={
              <Button variant="tonal" size="xs" icon="tune" onClick={openThemeEditor}>
                {t('v2.theme.title')}
              </Button>
            }
          >
            <Text variant="label-large" className="text-on-surface-variant">
              {t('account.preferences.selectTheme')}
            </Text>
            <ButtonGroup variant="connected" selection="single" value={theme.mode} fullWidth aria-label={t('account.preferences.selectTheme')}>
              {(
                [
                  ['light', 'light_mode', 'account.preferences.light'],
                  ['dark', 'dark_mode', 'account.preferences.dark'],
                  ['system', 'computer', 'account.preferences.system'],
                ] as const
              ).map(([value, icon, key]) => (
                <Button key={value} value={value} variant="tonal" icon={icon} onClick={(e: MouseEvent) => setModeWithReveal(theme.setMode, value as ThemeMode, e)}>
                  {t(key)}
                </Button>
              ))}
            </ButtonGroup>
            <div className="flex flex-col gap-4 pt-2">
              <Switch label={t('account.preferences.glass')} supportingText={t('account.preferences.glassDescription')} checked={prefs.glass} onChange={(e) => prefs.setPrefs({ glass: e.target.checked })} />
              <Switch label={t('account.preferences.motion')} supportingText={t('account.preferences.motionDescription')} checked={prefs.motion} onChange={(e) => prefs.setPrefs({ motion: e.target.checked })} />
            </div>
          </Section>

          <AutoTagPreferences />
          <NotificationPreferences />
        </div>
      )}

      <ConfirmDialog
        open={passkeyToRemove !== null}
        tone="danger"
        title={t('account.confirm.removePasskeyTitle')}
        message={t('account.confirm.removePasskeyMessage', { name: passkeyToRemove?.name || '' })}
        confirmLabel={t('account.confirm.removePasskeyConfirm')}
        onClose={() => setPasskeyToRemove(null)}
        onConfirm={async () => {
          if (!passkeyToRemove) return;
          setPasskeyError('');
          setPasskeySuccess('');
          setRemovingPasskeyId(passkeyToRemove.id);
          try {
            await removePasskey(passkeyToRemove.id);
            setPasskeySuccess(t('account.security.success.passkeyRemoved'));
            await refreshSecurity();
          } catch (error) {
            setPasskeyError((error as Error).message || t('account.security.errors.passkeyRemoveFailed'));
          } finally {
            setRemovingPasskeyId(null);
          }
        }}
      />
      <ConfirmDialog
        open={showSignOut}
        tone="danger"
        icon="logout"
        title={t('account.confirm.signOutTitle')}
        message={t('account.confirm.signOutMessage')}
        confirmLabel={t('account.confirm.signOutConfirm')}
        onClose={() => setShowSignOut(false)}
        onConfirm={() => logout()}
      />
      <Dialog
        open={showRemovePassword}
        onClose={() => {
          setShowRemovePassword(false);
          setRemovePasswordInput('');
          setPasswordError('');
        }}
        role="alertdialog"
        icon="warning"
        headline={t('account.confirm.removePasswordTitle')}
        maxWidth={440}
        actions={
          <>
            <Button
              variant="text"
              onClick={() => {
                setShowRemovePassword(false);
                setRemovePasswordInput('');
                setPasswordError('');
              }}
            >
              {t('account.security.cancel')}
            </Button>
            <Button variant="filled" className="v2-button-danger" loading={removingPassword} disabled={!removePasswordInput} onClick={() => void doRemovePassword()}>
              {t('account.security.remove')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Text variant="body-medium">{t('account.confirm.removePasswordMessage')}</Text>
          <TextField variant="outlined" type="password" label={t('account.confirm.removePasswordPlaceholder')} value={removePasswordInput} onValueChange={setRemovePasswordInput} passwordToggle fullWidth data-autofocus />
          {passwordError && <Notice tone="error">{passwordError}</Notice>}
        </div>
      </Dialog>
    </Page>
  );
}
