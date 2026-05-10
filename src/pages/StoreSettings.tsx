import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, ExternalLink, Loader2, Plus, ShoppingBag, Store as StoreIcon, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConnectedStore, disconnectStore, fetchStores } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';

const SUPPORTED_PLATFORMS = [
  {
    id: 'gumroad',
    label: 'Gumroad',
    description: 'Sell digital products on Gumroad.',
  },
] as const;

function platformLabel(id: string) {
  return SUPPORTED_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

function fallbackAvatar(seed: string) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}`;
}

function displayName(store: ConnectedStore) {
  return store.profileName || store.email || store.accountId || platformLabel(store.platform);
}

export function StoreSettings() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<ConnectedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConnectedStore | null>(null);

  const loadStores = async () => {
    setLoading(true);
    try {
      setStores(await fetchStores());
    } catch (error: any) {
      toast.error(error?.message || t('exports.stores.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
  }, []);

  // Surface OAuth callback result via URL params
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (success) {
      toast.success(t('exports.stores.connectSuccess'));
      const next = new URLSearchParams(searchParams);
      next.delete('success');
      setSearchParams(next, { replace: true });
      void loadStores();
    } else if (error) {
      toast.error(decodeURIComponent(error.replace(/\+/g, ' ')));
      const next = new URLSearchParams(searchParams);
      next.delete('error');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, t]);

  const handleDisconnect = async (store: ConnectedStore) => {
    try {
      setDisconnectingId(store.id);
      await disconnectStore(store.platform, store.id);
      setStores((prev) => prev.filter((item) => item.id !== store.id));
      toast.success(t('exports.stores.disconnectSuccess'));
    } catch (error: any) {
      toast.error(error?.message || t('exports.stores.disconnectError'));
    } finally {
      setDisconnectingId(null);
      setDeleteTarget(null);
    }
  };

  const connectedPlatforms = new Set(stores.map((s) => s.platform));

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={t('exports.stores.title')}
          description={t('exports.stores.description')}
          backLink={{ to: '/exports', label: t('exports.stores.backToExports') }}
          actions={(
            <a
              href="/api/stores/gumroad/connect"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-pink-700 bg-pink-600 px-4 text-sm font-bold text-white shadow-lg shadow-pink-600/10 transition hover:bg-pink-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              {t('exports.stores.connectGumroad')}
            </a>
          )}
        />

        <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500 shadow-lg shadow-pink-500/5">
                <StoreIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
                  {t('exports.stores.connectedTitle')}
                </h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {t('exports.stores.connectedDescription')}
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-950 dark:text-white" />
            </div>
          ) : stores.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-card bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-white">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-neutral-950 dark:text-white">
                {t('exports.stores.empty.title')}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                {t('exports.stores.empty.description')}
              </p>
              <a
                href="/api/stores/gumroad/connect"
                className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-pink-700 bg-pink-600 px-4 text-sm font-bold text-white transition hover:bg-pink-700"
              >
                <Plus className="h-4 w-4" />
                {t('exports.stores.connectGumroad')}
              </a>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-white/10">
              {stores.map((store) => (
                <div key={store.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <img
                      src={store.avatarUrl || fallbackAvatar(store.id)}
                      alt={displayName(store)}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 shrink-0 rounded-full border border-neutral-200 bg-neutral-100 object-cover dark:border-white/10 dark:bg-neutral-800"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-neutral-950 dark:text-white">
                          {displayName(store)}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {store.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <StoreIcon className="h-3.5 w-3.5" />
                          {platformLabel(store.platform)}
                        </span>
                        {store.email ? <span>{store.email}</span> : null}
                        <span>ID: {store.accountId}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <a
                      href={`/api/stores/${store.platform}/connect`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t('exports.stores.reconnect')}
                    </a>
                    <button
                      type="button"
                      disabled={disconnectingId === store.id}
                      onClick={() => setDeleteTarget(store)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {disconnectingId === store.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      {t('exports.stores.disconnect')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
            <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">
              {t('exports.stores.availableTitle')}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t('exports.stores.availableDescription')}
            </p>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-white/10">
            {SUPPORTED_PLATFORMS.map((platform) => {
              const isConnected = connectedPlatforms.has(platform.id);
              return (
                <div key={platform.id} className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h3 className="text-base font-bold text-neutral-950 dark:text-white">{platform.label}</h3>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {platform.description}
                    </p>
                  </div>
                  <a
                    href={`/api/stores/${platform.id}/connect`}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
                  >
                    <Plus className="h-4 w-4" />
                    {isConnected ? t('exports.stores.addAnother') : t('exports.stores.connect')}
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('exports.stores.confirmDisconnectTitle')}
        description={t('exports.stores.confirmDisconnectMessage', { name: deleteTarget ? displayName(deleteTarget) : '' })}
        confirmLabel={t('exports.stores.disconnect')}
        cancelLabel={t('exports.stores.cancel')}
        onConfirm={() => deleteTarget && void handleDisconnect(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}
