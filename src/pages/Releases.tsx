import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  Rocket,
  Store as StoreIcon,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ReleaseConnection,
  ReleaseProvider,
  connectDriveWithCredentials,
  disconnectDrive,
  disconnectStore,
  fetchReleaseConnections,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { applyAvatarFallback, defaultAvatar } from '../lib/avatar';

/** Per-provider presentation. Anything unknown falls back to a neutral cloud. */
const PROVIDER_STYLE: Record<string, { icon: typeof Cloud; accent: string; tint: string }> = {
  gumroad: { icon: StoreIcon, accent: 'text-pink-500', tint: 'bg-pink-500/10' },
  'google-drive': { icon: HardDrive, accent: 'text-emerald-500', tint: 'bg-emerald-500/10' },
  onedrive: { icon: Cloud, accent: 'text-sky-500', tint: 'bg-sky-500/10' },
  mega: { icon: Cloud, accent: 'text-red-500', tint: 'bg-red-500/10' },
};

function providerStyle(platform: string) {
  return PROVIDER_STYLE[platform] ?? { icon: Cloud, accent: 'text-neutral-500', tint: 'bg-neutral-500/10' };
}

export function Releases() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<ReleaseConnection[]>([]);
  const [providers, setProviders] = useState<ReleaseProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseConnection | null>(null);
  const [credentialsProvider, setCredentialsProvider] = useState<ReleaseProvider | null>(null);

  const providerLabel = useMemo(() => {
    const byId = new Map(providers.map((provider) => [provider.id, provider.label]));
    return (id: string) => byId.get(id) ?? id;
  }, [providers]);

  const displayName = (connection: ReleaseConnection) =>
    connection.displayName || connection.email || connection.accountId || providerLabel(connection.platform);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const data = await fetchReleaseConnections();
      setConnections(data.connections);
      setProviders(data.providers);
    } catch (error: any) {
      toast.error(error?.message || t('releases.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface OAuth callback results handed back as URL params.
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      toast.success(t('releases.connectSuccess'));
      const next = new URLSearchParams(searchParams);
      next.delete('success');
      setSearchParams(next, { replace: true });
      void loadConnections();
    } else if (error) {
      toast.error(decodeURIComponent(error.replace(/\+/g, ' ')));
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, t]);

  const handleDisconnect = async (connection: ReleaseConnection) => {
    try {
      setDisconnectingId(connection.id);
      if (connection.kind === 'drive') {
        await disconnectDrive(connection.id);
      } else {
        await disconnectStore(connection.platform, connection.id);
      }
      setConnections((prev) => prev.filter((item) => item.id !== connection.id));
      toast.success(t('releases.disconnectSuccess'));
    } catch (error: any) {
      toast.error(error?.message || t('releases.disconnectError'));
    } finally {
      setDisconnectingId(null);
      setDeleteTarget(null);
    }
  };

  const connectHref = (provider: ReleaseProvider) =>
    provider.kind === 'store'
      ? `/api/stores/${provider.id}/connect`
      : `/api/releases/drives/${provider.id}/connect`;

  const connectedCount = (providerId: string) =>
    connections.filter((connection) => connection.platform === providerId).length;

  const stores = connections.filter((connection) => connection.kind === 'store');
  const drives = connections.filter((connection) => connection.kind === 'drive');

  const renderConnection = (connection: ReleaseConnection) => {
    const style = providerStyle(connection.platform);
    const Icon = style.icon;
    const isExpired = connection.status !== 'active';
    return (
      <div
        key={connection.id}
        className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={connection.avatarUrl || defaultAvatar(connection.id, displayName(connection))}
            alt={displayName(connection)}
            referrerPolicy="no-referrer"
            className="h-12 w-12 shrink-0 rounded-full border border-neutral-200 bg-neutral-100 object-cover dark:border-white/10 dark:bg-neutral-800"
            onError={(event) => {
              applyAvatarFallback(event.currentTarget, connection.id, displayName(connection));
            }}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-bold text-neutral-950 dark:text-white">
                {displayName(connection)}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                  isExpired
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {isExpired ? <TriangleAlert className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {connection.status}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <span className={`inline-flex items-center gap-1 ${style.accent}`}>
                <Icon className="h-3.5 w-3.5" />
                {providerLabel(connection.platform)}
              </span>
              {connection.email ? <span>{connection.email}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {connection.kind === 'store' ? (
            <a
              href={`/api/stores/${connection.platform}/connect`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
            >
              <ExternalLink className="h-4 w-4" />
              {t('releases.reconnect')}
            </a>
          ) : null}
          <button
            type="button"
            disabled={disconnectingId === connection.id}
            onClick={() => setDeleteTarget(connection)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {disconnectingId === connection.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t('releases.disconnect')}
          </button>
        </div>
      </div>
    );
  };

  const renderSection = (
    title: string,
    description: string,
    icon: typeof Cloud,
    tint: string,
    accent: string,
    rows: ReleaseConnection[],
    emptyText: string,
  ) => {
    const Icon = icon;
    return (
      <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
        <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint} ${accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">{title}</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">{emptyText}</p>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-white/10">{rows.map(renderConnection)}</div>
        )}
      </section>
    );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-6 md:space-y-8 pb-20">
        <PageHeader
          title={t('releases.title')}
          description={t('releases.description')}
          backLink={{ to: '/exports', label: t('releases.backToExports') }}
        />

        {loading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-950 dark:text-white" />
          </div>
        ) : connections.length === 0 ? (
          <section className="flex flex-col items-center justify-center rounded-xl border border-neutral-200/50 bg-white/70 px-6 py-20 text-center shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-white">
              <Rocket className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-950 dark:text-white">{t('releases.empty.title')}</h3>
            <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              {t('releases.empty.description')}
            </p>
          </section>
        ) : (
          <>
            {renderSection(
              t('releases.drives.title'),
              t('releases.drives.description'),
              HardDrive,
              'bg-emerald-500/10',
              'text-emerald-500',
              drives,
              t('releases.drives.empty'),
            )}
            {renderSection(
              t('releases.storefronts.title'),
              t('releases.storefronts.description'),
              StoreIcon,
              'bg-pink-500/10',
              'text-pink-500',
              stores,
              t('releases.storefronts.empty'),
            )}
          </>
        )}

        <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
            <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
              {t('releases.availableTitle')}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t('releases.availableDescription')}
            </p>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-white/10">
            {providers.map((provider) => {
              const style = providerStyle(provider.id);
              const Icon = style.icon;
              const count = connectedCount(provider.id);
              const label = count > 0 ? t('releases.addAnother') : t('releases.connect');
              return (
                <div key={`${provider.kind}-${provider.id}`} className="flex items-center justify-between gap-4 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.tint} ${style.accent}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-neutral-950 dark:text-white">{provider.label}</h3>
                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {t(`releases.providerHint.${provider.id}`)}
                        {count > 0 ? ` · ${t('releases.connectedCount', { count })}` : ''}
                      </p>
                    </div>
                  </div>
                  {!provider.configured ? (
                    <span
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl bg-neutral-500/10 px-3 text-sm font-bold text-neutral-500"
                      title={t('releases.notConfiguredHint')}
                    >
                      <Lock className="h-4 w-4" />
                      {t('releases.notConfigured')}
                    </span>
                  ) : provider.authKind === 'credentials' ? (
                    <button
                      type="button"
                      onClick={() => setCredentialsProvider(provider)}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
                    >
                      <Plus className="h-4 w-4" />
                      {label}
                    </button>
                  ) : (
                    <a
                      href={connectHref(provider)}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
                    >
                      <Plus className="h-4 w-4" />
                      {label}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {credentialsProvider ? (
        <CredentialsConnectDialog
          provider={credentialsProvider}
          onClose={() => setCredentialsProvider(null)}
          onConnected={() => {
            setCredentialsProvider(null);
            void loadConnections();
          }}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('releases.confirmDisconnectTitle')}
        description={t('releases.confirmDisconnectMessage', {
          name: deleteTarget ? displayName(deleteTarget) : '',
        })}
        confirmLabel={t('releases.disconnect')}
        cancelLabel={t('releases.cancel')}
        onConfirm={() => deleteTarget && void handleDisconnect(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}

/** Sign-in form for drives without OAuth (MEGA). */
function CredentialsConnectDialog({
  provider,
  onClose,
  onConnected,
}: {
  provider: ReleaseProvider;
  onClose: () => void;
  onConnected: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secondFactorCode, setSecondFactorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await connectDriveWithCredentials(provider.id, { email, password, secondFactorCode });
      toast.success(t('releases.connectSuccess'));
      onConnected();
    } catch (error: any) {
      toast.error(error?.message || t('releases.credentials.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200/50 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900"
      >
        <div>
          <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
            {t('releases.credentials.title', { provider: provider.label })}
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t('releases.credentials.description', { provider: provider.label })}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            {t('releases.credentials.email')}
          </span>
          <input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            {t('releases.credentials.password')}
          </span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            {t('releases.credentials.twoFactor')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={secondFactorCode}
            onChange={(event) => setSecondFactorCode(event.target.value)}
            className={inputClass}
          />
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            {t('releases.credentials.twoFactorHint')}
          </span>
        </label>

        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          {t('releases.credentials.storageNotice')}
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
          >
            {t('releases.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? t('releases.credentials.connecting') : t('releases.credentials.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
