import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Database, FileArchive, Fingerprint, Folder, Globe, HardDrive, KeyRound, Loader2, LogOut, Play, Shield, Trash2, User as UserIcon, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { beginPasskeyRegistration, disableTwoFactor, fetchCurrentUser, fetchLibraries, fetchProjects, fetchProviders, fetchSecuritySettings, fetchStorageAnalysis, finishPasskeyRegistration, removePasskey, removePassword, updatePassword } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { SecuritySettings, StorageAnalysis, User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isPasskeySupported, serializeAttestationCredential, toPublicKeyCreationOptions } from '../lib/passkey';
import { toast } from 'sonner';

type AccountTab = 'overview' | 'storage' | 'security' | 'preferences';
const ACCOUNT_TABS: AccountTab[] = ['overview', 'storage', 'security', 'preferences'];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'fr', label: 'Français' },
];
const STORAGE_COLORS: Record<string, string> = {
  projects: '#3b82f6',
  album: '#60a5fa',
  workflow: '#10b981',
  orphans: '#f59e0b',
  libraries: '#ec4899',
  archives: '#6366f1',
  trash: '#ef4444',
  other: '#94a3b8',
};
const TIER_NAMES: Record<number, string> = {
  [5 * 1024 * 1024 * 1024]: 'Free',
  [100 * 1024 * 1024 * 1024]: 'Professional',
  [500 * 1024 * 1024 * 1024]: 'Premium',
};

function isAccountTab(value: string | null): value is AccountTab {
  return value !== null && ACCOUNT_TABS.includes(value as AccountTab);
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatTier(limit?: number) {
  if (!limit) return 'Custom';
  if (Math.abs(limit - 5 * 1024 * 1024 * 1024) < 1000) return 'Free';
  if (Math.abs(limit - 100 * 1024 * 1024 * 1024) < 1000) return 'Professional';
  if (Math.abs(limit - 500 * 1024 * 1024 * 1024) < 1000) return 'Premium';
  return 'Custom';
}

export function Account() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { logout } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [storage, setStorage] = useState<StorageAnalysis | null>(null);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  const [providerCount, setProviderCount] = useState<number | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userLoadError, setUserLoadError] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoadError, setOverviewLoadError] = useState('');
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState('');
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [removePasswordInput, setRemovePasswordInput] = useState('');
  const [removingPassword, setRemovingPassword] = useState(false);
  const [showRemovePasswordConfirm, setShowRemovePasswordConfirm] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityLoaded, setSecurityLoaded] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyError, setPasskeyError] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState('');
  const [savingPasskey, setSavingPasskey] = useState(false);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [twoFactorDisablePassword, setTwoFactorDisablePassword] = useState('');
  const [twoFactorDisableCode, setTwoFactorDisableCode] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');
  const [twoFactorSuccess, setTwoFactorSuccess] = useState('');
  const [disablingTwoFactor, setDisablingTwoFactor] = useState(false);
  const [activeTab, setActiveTab] = useState<AccountTab>(() => {
    const tab = searchParams.get('tab');
    return isAccountTab(tab) ? tab : 'overview';
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    const normalizedTab = isAccountTab(tab) ? tab : 'overview';

    if (normalizedTab !== activeTab) {
      setActiveTab(normalizedTab);
    }

    if (tab !== normalizedTab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', normalizedTab);
      setSearchParams(next, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      setUserLoading(true);
      setUserLoadError('');

      try {
        const me = await fetchCurrentUser();

        if (!mounted) return;

        setUser(me);
      } catch (error: any) {
        if (!mounted) return;
        setUserLoadError(error.message || 'Failed to load account');
      } finally {
        if (mounted) setUserLoading(false);
      }
    };

    loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user || activeTab !== 'overview' || overviewLoaded || overviewLoading) return;

    const loadOverview = async () => {
      setOverviewLoading(true);
      setOverviewLoadError('');

      try {
        const [projects, libraries, providers] = await Promise.all([
          fetchProjects(1, 1),
          fetchLibraries(1, 1),
          fetchProviders(),
        ]);

        setProjectCount(projects.total);
        setLibraryCount(libraries.total);
        setProviderCount(providers.length);
        setOverviewLoaded(true);
      } catch (error: any) {
        setOverviewLoadError(error.message || 'Failed to load overview');
      } finally {
        setOverviewLoading(false);
      }
    };

    void loadOverview();
  }, [activeTab, overviewLoaded, overviewLoading, user]);

  useEffect(() => {
    if (!user || activeTab !== 'storage' || storageLoaded || storageLoading) return;

    const loadStorage = async () => {
      setStorageLoading(true);
      setStorageLoadError('');

      try {
        const storageAnalysis = await fetchStorageAnalysis({ includeProjects: false });
        setStorage(storageAnalysis);
        setStorageLoaded(true);
      } catch (error: any) {
        setStorageLoadError(error.message || 'Failed to load storage');
      } finally {
        setStorageLoading(false);
      }
    };

    void loadStorage();
  }, [activeTab, storageLoaded, storageLoading, user]);

  useEffect(() => {
    if (!user || activeTab !== 'security' || securityLoaded || securityLoading) return;

    const loadSecurity = async () => {
      setSecurityLoading(true);
      setSecurityError('');

      try {
        const settings = await fetchSecuritySettings();
        setSecuritySettings(settings);
        setSecurityLoaded(true);
      } catch (error: any) {
        setSecurityError(error.message || 'Failed to load security settings');
      } finally {
        setSecurityLoading(false);
      }
    };

    void loadSecurity();
  }, [activeTab, securityLoaded, securityLoading, user]);

  const usagePercent = useMemo(() => {
    if (!storage?.limit) return 0;
    return Math.min(100, (storage.totalSize / storage.limit) * 100);
  }, [storage]);

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated successfully.');
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRemovePassword = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    setRemovingPassword(true);
    try {
      await removePassword(removePasswordInput);
      setRemovePasswordInput('');
      setShowRemovePasswordConfirm(false);
      setPasswordSuccess('Password removed. Your account is now passwordless.');
      const updated = await fetchCurrentUser();
      setUser(updated);
    } catch (error: any) {
      setPasswordError(error.message || 'Failed to remove password.');
    } finally {
      setRemovingPassword(false);
    }
  };

  const handleTabChange = (tab: AccountTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const retryOverviewLoad = () => {
    setOverviewLoaded(false);
    setOverviewLoadError('');
  };

  const retryStorageLoad = () => {
    setStorageLoaded(false);
    setStorageLoadError('');
  };

  const retrySecurityLoad = () => {
    setSecurityLoaded(false);
    setSecurityError('');
  };

  const refreshSecurity = async () => {
    const settings = await fetchSecuritySettings();
    setSecuritySettings(settings);
    setSecurityLoaded(true);
    const me = await fetchCurrentUser();
    setUser(me);
  };

  const handleConfirmSignOut = () => {
    logout();
  };

  const handlePasskeyRegistration = async () => {
    if (!isPasskeySupported()) {
      setPasskeyError('This browser does not support passkeys.');
      return;
    }

    setPasskeyError('');
    setPasskeySuccess('');
    setSavingPasskey(true);

    try {
      const { options, flowToken } = await beginPasskeyRegistration(passkeyName.trim() || 'This device');
      const credential = await navigator.credentials.create({
        publicKey: toPublicKeyCreationOptions(options),
      });

      if (!credential) {
        throw new Error('Passkey registration was cancelled.');
      }

      await finishPasskeyRegistration(flowToken, serializeAttestationCredential(credential as PublicKeyCredential));
      setPasskeyName('');
      setPasskeySuccess('Passkey added successfully.');
      await refreshSecurity();
    } catch (error: any) {
      setPasskeyError(error.message || 'Failed to register passkey.');
    } finally {
      setSavingPasskey(false);
    }
  };

  const handlePasskeyRemoval = async (passkeyId: string) => {
    setPasskeyError('');
    setPasskeySuccess('');
    setRemovingPasskeyId(passkeyId);

    try {
      await removePasskey(passkeyId);
      setPasskeySuccess('Passkey removed.');
      await refreshSecurity();
    } catch (error: any) {
      setPasskeyError(error.message || 'Failed to remove passkey.');
    } finally {
      setRemovingPasskeyId(null);
    }
  };

  const handleDisableTwoFactor = async (event: FormEvent) => {
    event.preventDefault();
    setTwoFactorError('');
    setTwoFactorSuccess('');
    setDisablingTwoFactor(true);

    try {
      await disableTwoFactor(twoFactorDisablePassword, twoFactorDisableCode);
      setTwoFactorDisablePassword('');
      setTwoFactorDisableCode('');
      setTwoFactorSuccess('Two-factor authentication has been disabled.');
      await refreshSecurity();
    } catch (error: any) {
      setTwoFactorError(error.message || 'Failed to disable 2FA.');
    } finally {
      setDisablingTwoFactor(false);
    }
  };

  if (userLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 lg:p-10">
        <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div>
              <h1 className="font-semibold text-white">Account unavailable</h1>
              <p className="mt-1 text-sm">{userLoadError || 'The account data could not be loaded.'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10">
      <div className="w-full space-y-8">
        <PageHeader
          title={t('account.title')}
          description={t('account.description')}
        />

        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-3">
          <div className="grid gap-2 md:grid-cols-4">
            {[
              { id: 'overview' as const, label: t('account.tabs.overview'), icon: UserIcon },
              { id: 'storage' as const, label: t('account.tabs.storage'), icon: HardDrive },
              { id: 'security' as const, label: t('account.tabs.security'), icon: Shield },
              { id: 'preferences' as const, label: t('account.tabs.preferences'), icon: Globe },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-blue-500/30 bg-blue-500/10 text-white'
                      : 'border-neutral-800 bg-neutral-950/70 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-blue-300' : 'text-neutral-500'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'overview' && (
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-300">
                  <UserIcon className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">{t('account.overview.profile')}</p>
                    <h2 className="mt-1 text-xl font-bold text-white">{user.email}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                      {user.role === 'admin' ? t('account.overview.administrator') : t('account.overview.user')}
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300">
                      {t('account.overview.plan', { tier: formatTier(user.storageLimit) })}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500">
                    {t('account.overview.memberSince', { date: new Date(user.createdAt).toLocaleDateString() })}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSignOutConfirm(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/15"
              >
                <LogOut className="h-4 w-4" />
                {t('account.overview.signOut')}
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {overviewLoading && !overviewLoaded ? (
                <div className="col-span-full flex min-h-[220px] items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950/60">
                  <Loader2 className="h-6 w-6 animate-spin text-neutral-500" />
                </div>
              ) : overviewLoadError ? (
                <div className="col-span-full rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-amber-300">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                      <div>
                        <h3 className="font-semibold text-white">Overview unavailable</h3>
                        <p className="mt-1 text-sm">{overviewLoadError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={retryOverviewLoad}
                      className="rounded-xl border border-amber-400/20 px-3 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-400/10"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Play className="h-4 w-4 text-green-400" />
                      <span className="text-xs uppercase tracking-[0.18em]">Projects</span>
                    </div>
                    <p className="mt-4 text-3xl font-black text-white">{projectCount ?? 0}</p>
                    <Link to="/projects" className="mt-3 inline-block text-sm text-green-400 hover:text-green-300">Open projects</Link>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <Folder className="h-4 w-4 text-blue-400" />
                      <span className="text-xs uppercase tracking-[0.18em]">Libraries</span>
                    </div>
                    <p className="mt-4 text-3xl font-black text-white">{libraryCount ?? 0}</p>
                    <Link to="/libraries" className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300">Open libraries</Link>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                    <div className="flex items-center gap-2 text-neutral-400">
                      <KeyRound className="h-4 w-4 text-amber-400" />
                      <span className="text-xs uppercase tracking-[0.18em]">Providers</span>
                    </div>
                    <p className="mt-4 text-3xl font-black text-white">{providerCount ?? 0}</p>
                    <Link to="/providers" className="mt-3 inline-block text-sm text-amber-400 hover:text-amber-300">Manage providers</Link>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {activeTab === 'storage' && (
          <div className="space-y-8">
            {storageLoading && !storageLoaded ? (
              <section className="flex min-h-[320px] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
              </section>
            ) : storageLoadError || !storage ? (
              <section className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-300">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <div>
                      <h2 className="font-semibold text-white">Storage unavailable</h2>
                      <p className="mt-1 text-sm">{storageLoadError || 'The storage data could not be loaded.'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={retryStorageLoad}
                    className="rounded-xl border border-amber-400/20 px-3 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-400/10"
                  >
                    Retry
                  </button>
                </div>
              </section>
            ) : (
              <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Storage</h2>
                    <p className="text-sm text-neutral-400">Detailed breakdown of your workspace capacity and usage.</p>
                  </div>
                </div>

                <div className="mt-8 space-y-6">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Capacity Overview</p>
                        <p className="mt-2 text-sm text-neutral-400">{usagePercent.toFixed(1)}% of your total quota is currently occupied.</p>
                      </div>
                      <div className="text-right text-sm text-neutral-400">
                        {formatBytes(storage.totalSize)} / {formatBytes(storage.limit)}
                      </div>
                    </div>

                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className={`h-full rounded-full ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 70 ? 'bg-amber-500' : 'bg-cyan-500'}`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">

                    <div className="rounded-2xl border border-blue-500/10 bg-neutral-950/80 p-5">
                      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Consumption</span>
                      <p className="mt-4 text-3xl font-black text-white">{formatBytes(storage.totalSize)}</p>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Plan Limit</span>
                      <p className="mt-4 text-3xl font-black text-white">{formatBytes(storage.limit)}</p>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Usage</span>
                      <p className="mt-4 text-3xl font-black text-white">{usagePercent.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5">
                      <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">Tier</span>
                      <p className="mt-4 text-3xl font-black text-white">{TIER_NAMES[storage.limit] || 'Custom'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {storage.categories.map((category) => {
                      const visibleSubCategories = category.subCategories?.filter((subCategory) => subCategory.id !== 'drafts');

                      return (
                      <div key={category.id} className="flex h-full min-h-[210px] flex-col rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: STORAGE_COLORS[category.id] || STORAGE_COLORS.other }}
                            />
                            <p className="text-sm font-medium text-white">{category.name}</p>
                          </div>
                          <span className="text-sm font-semibold text-neutral-300">{formatBytes(category.size)}</span>
                        </div>

                        <p className="mt-2 text-xs text-neutral-500">
                          {storage.totalSize > 0 ? `${((category.size / storage.totalSize) * 100).toFixed(1)}% of used space` : 'No usage yet'}
                        </p>

                        {visibleSubCategories && visibleSubCategories.length > 0 && (
                          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-neutral-800 pt-4">
                            {visibleSubCategories.map((subCategory) => (
                              <div key={subCategory.id}>
                                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500">{subCategory.name}</p>
                                <p className="mt-1 text-xs font-semibold text-neutral-300">{formatBytes(subCategory.size)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )})}
                  </div>

                  <div>
                    <div className="rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-600/10 to-indigo-600/10 p-6">
                      <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                        <Zap className="h-5 w-5 text-yellow-400" />
                        Optimization
                      </h3>
                      <div className="mt-5 grid gap-4">
                        <Link to="/trash" className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-red-500/30">
                          <div className="flex items-center gap-3">
                            <Trash2 className="h-5 w-5 text-red-400" />
                            <p className="font-medium text-white">Recycle Bin cleanup</p>
                          </div>
                          <p className="mt-2 text-sm text-neutral-400">
                            {formatBytes(storage.categories.find((category) => category.id === 'trash')?.size || 0)} can be permanently removed.
                          </p>
                        </Link>

                        <Link to="/projects" className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 transition hover:border-amber-500/30">
                          <div className="flex items-center gap-3">
                            <Folder className="h-5 w-5 text-amber-400" />
                            <p className="font-medium text-white">Project storage review</p>
                          </div>
                          <p className="mt-2 text-sm text-neutral-400">
                            Inspect the heaviest projects and clear orphaned assets where needed.
                          </p>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            {securityLoading && !securityLoaded ? (
              <section className="flex min-h-[320px] items-center justify-center rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                <Loader2 className="h-8 w-8 animate-spin text-neutral-500" />
              </section>
            ) : securityError || !securitySettings ? (
              <section className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-6 text-amber-300">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
                    <div>
                      <h2 className="font-semibold text-white">Security unavailable</h2>
                      <p className="mt-1 text-sm">{securityError || 'The security settings could not be loaded.'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={retrySecurityLoad}
                    className="rounded-xl border border-amber-400/20 px-3 py-2 text-sm font-medium text-amber-200 transition-colors hover:bg-amber-400/10"
                  >
                    Retry
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Password</h2>
                      <p className="text-sm text-neutral-400">
                        {user?.hasPassword ? 'Rotate your password without leaving the app.' : 'Set a password to enable password-based sign in.'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handlePasswordSubmit} className="mt-6 w-full space-y-4">
                    {user?.hasPassword && (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-400">Current password</label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                          required
                        />
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-400">New password</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                          minLength={8}
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-neutral-400">Confirm new password</label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                          minLength={8}
                          required
                        />
                      </div>
                    </div>

                    {passwordError && (
                      <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{passwordError}</span>
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{passwordSuccess}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={savingPassword}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                      {user?.hasPassword ? 'Update password' : 'Set password'}
                    </button>
                  </form>

                  {user?.hasPassword && securitySettings && securitySettings.passkeys.length > 0 && (
                    <div className="mt-6 border-t border-neutral-800 pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-neutral-300">Go passwordless</p>
                          <p className="text-xs text-neutral-500">Remove your password and sign in with passkeys only.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowRemovePasswordConfirm(true)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remove password
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                        <Fingerprint className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Passkeys</h2>
                        <p className="text-sm text-neutral-400">Use Face ID, Touch ID, Windows Hello, or a hardware key to sign in.</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300">
                      {securitySettings.passkeys.length} registered
                    </span>
                  </div>

                  <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 md:flex-row">
                    <input
                      type="text"
                      value={passkeyName}
                      onChange={(event) => setPasskeyName(event.target.value)}
                      placeholder="This MacBook"
                      className="flex-1 rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                    />
                    <button
                      type="button"
                      onClick={handlePasskeyRegistration}
                      disabled={savingPasskey}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingPasskey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                      Add passkey
                    </button>
                  </div>

                  {passkeyError && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{passkeyError}</span>
                    </div>
                  )}

                  {passkeySuccess && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{passkeySuccess}</span>
                    </div>
                  )}

                  <div className="mt-6 space-y-3">
                    {securitySettings.passkeys.length === 0 ? (
                      <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-5 text-sm text-neutral-400">
                        No passkeys registered yet.
                      </div>
                    ) : (
                      securitySettings.passkeys.map((passkey) => (
                        <div key={passkey.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 px-4 py-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-white">{passkey.name}</p>
                            <p className="mt-1 text-sm text-neutral-500">
                              Added {new Date(passkey.createdAt).toLocaleString()}
                              {passkey.lastUsedAt ? ` • Last used ${new Date(passkey.lastUsedAt).toLocaleString()}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handlePasskeyRemoval(passkey.id)}
                            disabled={removingPasskeyId === passkey.id}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-60"
                          >
                            {removingPasskeyId === passkey.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                        <Shield className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Two-Factor Authentication</h2>
                        <p className="text-sm text-neutral-400">Require a time-based authenticator code after password login.</p>
                      </div>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${securitySettings.twoFactorEnabled ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-neutral-700 bg-neutral-800 text-neutral-300'}`}>
                      {securitySettings.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  {twoFactorError && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{twoFactorError}</span>
                    </div>
                  )}

                  {twoFactorSuccess && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>{twoFactorSuccess}</span>
                    </div>
                  )}

                  {!securitySettings.twoFactorEnabled ? (
                    <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                      <p className="text-sm text-neutral-400">
                        Start the authenticator setup in a dedicated page so the verification flow has more room.
                      </p>
                      {securitySettings.pendingTwoFactorSetup && (
                        <p className="mt-2 text-sm text-amber-300">
                          A setup is already in progress. Opening the page will let you continue and verify it.
                        </p>
                      )}
                      <Link
                        to="/account/security/2fa"
                        className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
                      >
                        <Shield className="h-4 w-4" />
                        Open 2FA Setup
                      </Link>
                    </div>
                  ) : (
                    <form onSubmit={handleDisableTwoFactor} className="mt-6 space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        {user?.hasPassword && (
                          <div>
                            <label className="mb-2 block text-sm font-medium text-neutral-400">Current password</label>
                            <input
                              type="password"
                              value={twoFactorDisablePassword}
                              onChange={(event) => setTwoFactorDisablePassword(event.target.value)}
                              className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                              required
                            />
                          </div>
                        )}
                        <div>
                          <label className="mb-2 block text-sm font-medium text-neutral-400">Authenticator code</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={twoFactorDisableCode}
                            onChange={(event) => setTwoFactorDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50 font-mono tracking-[0.3em]"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={disablingTwoFactor}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {disablingTwoFactor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                        Disable 2FA
                      </button>
                    </form>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{t('account.preferences.language')}</h2>
                  <p className="text-sm text-neutral-400">{t('account.preferences.languageDescription')}</p>
                </div>
              </div>

              <div className="mt-8 max-w-sm">
                <label className="mb-2 block text-sm font-medium text-neutral-400">{t('account.preferences.selectLanguage')}</label>
                <div className="relative group">
                  <select
                    value={i18n.language}
                    onChange={(e) => void i18n.changeLanguage(e.target.value)}
                    className="w-full appearance-none rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-blue-500/50"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-neutral-500 group-hover:text-neutral-300 transition-colors">
                    <ChevronRight className="h-4 w-4 rotate-90" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        <ConfirmModal
          isOpen={showSignOutConfirm}
          onClose={() => setShowSignOutConfirm(false)}
          onConfirm={handleConfirmSignOut}
          title="Sign out"
          message="Are you sure you want to sign out of Remix Studio on this device?"
          confirmText="Sign Out"
          type="danger"
        />

        {showRemovePasswordConfirm && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
            onClick={() => { setShowRemovePasswordConfirm(false); setRemovePasswordInput(''); setPasswordError(''); }}
          >
            <div
              className="bg-neutral-900 border border-neutral-800/50 rounded-[32px] shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8">
                <div className="flex items-start gap-6">
                  <div className="p-4 rounded-3xl flex-shrink-0 bg-red-500/10 text-red-500 border border-red-500/20">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-2xl font-black text-white tracking-tight">Remove password</h3>
                    <p className="mt-3 text-base text-neutral-400 font-medium leading-relaxed">
                      This will remove your password. You will only be able to sign in using passkeys. Enter your current password to confirm.
                    </p>
                    <input
                      type="password"
                      value={removePasswordInput}
                      onChange={(e) => setRemovePasswordInput(e.target.value)}
                      placeholder="Current password"
                      className="mt-4 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-100 outline-none transition focus:border-red-500/50"
                      autoFocus
                    />
                    {passwordError && (
                      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{passwordError}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-8 py-6 bg-neutral-950/40 flex items-center justify-end gap-4 border-t border-neutral-800/50">
                <button
                  onClick={() => { setShowRemovePasswordConfirm(false); setRemovePasswordInput(''); setPasswordError(''); }}
                  className="px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/50 transition-all border border-transparent hover:border-neutral-800/80 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemovePassword}
                  disabled={removingPassword || !removePasswordInput}
                  className="px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-red-600 hover:bg-red-500 text-white shadow-2xl shadow-red-500/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {removingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
