import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { deleteProvider, fetchProvider, fetchProviderModels, updateProvider } from '../../api';
import { Button, Icon, IconButton, LoadingIndicator, Text, useSnackbar } from '../../m3';
import type { Provider } from '../../types';
import { SectionNav } from '../components/project/ResultsBar';
import { ParallelStepper } from '../components/providers/ProviderItem';
import { ModelRows, useModelEntries, type ModelEntry } from '../components/providers/ModelRows';
import { ProviderHero } from '../components/providers/ProviderHero';
import { activeJobCount, PROVIDER_KINDS, projectCount, providerHasCredentials, urlHost, type ProviderKind } from '../components/providers/providerMeta';
import { clampParallel, useParallelSaver } from '../components/providers/useParallelSaver';
import { relativeTime } from '../components/users/userMeta';
import { formatDateTime } from '../lib/format';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page } from '../ui/Page';
import { PromptDialog } from '../ui/PromptDialog';
import { ResultsSearch } from '../ui/ResultFilters';
import { StatusPill } from '../ui/Stat';

/** Providers whose model list is built in rather than fetched with credentials. */
const STATIC_MODELS = new Set(['RunningHub', 'KlingAI', 'BytePlus', 'Replicate', 'BlackForestLabs', 'MiniMax', 'Civitai']);
const QUEUE_HREF = '/projects/queues?view=providers';
const LIVE_REFRESH_MS = 15000;

type View = 'all' | ProviderKind;
const VIEWS: View[] = ['all', ...PROVIDER_KINDS];
const VIEW_ICONS: Record<View, string> = { all: 'model_training', text: 'notes', image: 'image', video: 'movie', audio: 'music_note' };

export function ProviderProfile() {
  const { t, i18n } = useTranslation();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS as string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as View) : 'all';
  const q = params.get('q') ?? '';
  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (!value || value === 'all') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const setSearch = useCallback((value: string) => update({ q: value.trim() }), [update]);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { schedule: scheduleParallel, isPending: parallelPending } = useParallelSaver(() => void loadProvider({ quiet: true }));

  const loadProvider = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (!id) return;
      try {
        if (!quiet) setIsLoadingProvider(true);
        setError(null);
        const next = await fetchProvider(id);
        // A count still waiting to be saved keeps the value on screen.
        setProvider((current) => (current && parallelPending(next.id) ? { ...next, concurrency: current.concurrency } : next));
      } catch {
        if (!quiet) setError(t('providerProfile.errorLoad'));
      } finally {
        if (!quiet) setIsLoadingProvider(false);
      }
    },
    [id, t, parallelPending],
  );
  useEffect(() => {
    void loadProvider();
  }, [loadProvider]);

  // Usage follows running jobs while there are any.
  const running = provider ? activeJobCount(provider) > 0 : false;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadProvider({ quiet: true });
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running, loadProvider]);

  // Which built-in models the key can reach, for services that list their models.
  const [reachable, setReachable] = useState<Set<string> | null>(null);
  const [checking, setChecking] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const isStatic = provider ? STATIC_MODELS.has(provider.type) : false;
  const canCheck = Boolean(provider && !isStatic && provider.hasKey);
  const checkModels = useCallback(async () => {
    if (!id) return;
    try {
      setChecking(true);
      setModelsError(null);
      const result = await fetchProviderModels(id);
      setReachable(new Set(result.models.map((model) => model.id)));
      if (result.error) setModelsError(result.error);
    } catch {
      setReachable(null);
      setModelsError(t('providerProfile.errors.fetchModels'));
    } finally {
      setChecking(false);
    }
  }, [id, t]);
  useEffect(() => {
    if (canCheck) void checkModels();
  }, [canCheck, checkModels]);

  const customIds = useMemo(() => new Set((provider?.customModels ?? []).map((model) => model.customModelId)), [provider]);
  const baseEntries = useModelEntries(provider?.models ?? [], customIds);
  const entries: ModelEntry[] = useMemo(
    () => baseEntries.map((entry) => (canCheck && reachable && !entry.custom ? { ...entry, reach: reachable.has(entry.modelId) ? ('yes' as const) : ('no' as const) } : entry)),
    [baseEntries, canCheck, reachable],
  );
  const matching = useMemo(() => {
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((entry) => words.every((word) => `${entry.name}\n${entry.modelId}\n${entry.description ?? ''}`.toLocaleLowerCase().includes(word)));
  }, [entries, q]);
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: matching.length, text: 0, image: 0, video: 0, audio: 0 };
    for (const entry of matching) result[entry.kind] += 1;
    return result;
  }, [matching]);
  const shown = view === 'all' ? matching : matching.filter((entry) => entry.kind === view);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.providers.copied')))
      .catch(() => snackbar.show(t('v2.providers.copyFailed')));
  };

  if (isLoadingProvider) return <LoadingState minHeight={400} />;
  if (error || !provider) {
    return (
      <Page>
        <EmptyState
          icon="error"
          shape="boom"
          title={error || t('providerProfile.errorNotFound')}
          action={
            <Button variant="tonal" href="/providers">
              {t('providerProfile.backToProviders')}
            </Button>
          }
        />
      </Page>
    );
  }

  const ready = providerHasCredentials(provider);
  const editHref = `/provider/${provider.id}/edit`;
  const projects = projectCount(provider);
  const jobs = activeJobCount(provider);
  const reachableCount = entries.filter((entry) => entry.reach === 'yes').length;
  const checkedCount = entries.filter((entry) => entry.reach).length;
  const summary = isStatic
    ? t('v2.providers.models.builtIn')
    : checking
      ? t('v2.providers.models.checking')
      : canCheck && reachable && checkedCount > 0
        ? t('v2.providers.models.checked', { reachable: reachableCount, total: checkedCount })
        : '';
  const usage = projects > 0 || jobs > 0 ? t('providers.deleteDialog.usageWarning', { projectCount: projects, jobCount: jobs }) : '';

  return (
    <Page className="v2-provider-page v2-provider-profile" density="compact">
      <ProviderHero
        type={provider.type}
        backLink={{ to: '/providers', label: t('providers.title') }}
        title={provider.name}
        subtitle={
          provider.apiUrl && (
            <span className="v2-provider-hero__host" title={provider.apiUrl}>
              <Icon name="public" size={16} aria-hidden />
              {urlHost(provider.apiUrl)}
            </span>
          )
        }
        badges={
          ready ? (
            <StatusPill tone="success" icon="verified">
              {provider.type === 'KlingAI' ? t('providerProfile.credentialsStored') : t('providerProfile.keyStored')}
            </StatusPill>
          ) : (
            <StatusPill tone="warning" icon="key_off">
              {provider.type === 'KlingAI' ? t('providerProfile.missingCredentials') : t('providerProfile.noKey')}
            </StatusPill>
          )
        }
        actions={
          <>
            {provider.type === 'BytePlus' && (
              <Button variant="tonal" icon="layers" href={`/provider/${provider.id}/custom-models`}>
                {t('providerProfile.customModels')}
              </Button>
            )}
            <Button variant="filled" icon={ready ? 'edit' : 'key'} href={editHref} emphasized>
              {ready ? t('providerProfile.edit') : t('v2.providers.addKey')}
            </Button>
            <ActionMenu
              label={t('v2.providers.actionsFor', { name: provider.name })}
              size="md"
              items={[
                { key: 'rename', icon: 'drive_file_rename_outline', label: t('v2.providers.rename'), onSelect: () => setRenaming(true) },
                { key: 'queue', icon: 'monitoring', label: t('sidebar.queueMonitor'), href: QUEUE_HREF },
                { key: 'copy-id', icon: 'fingerprint', label: t('v2.providers.copyId'), onSelect: () => copy(provider.id) },
                { key: 'delete', icon: 'delete', label: t('providers.deleteDialog.confirm'), danger: true, divider: true, onSelect: () => setConfirmDelete(true) },
              ]}
            />
          </>
        }
        stats={
          <ul className="v2-provider-hero__stats">
            <li className="v2-provider-hero__stat">
              <span className="v2-provider-hero__stat-label">{t('v2.providers.parallel')}</span>
              <ParallelStepper
                value={provider.concurrency || 1}
                name={provider.name}
                onChange={(value) => {
                  const concurrency = clampParallel(value);
                  setProvider({ ...provider, concurrency });
                  scheduleParallel(provider, concurrency);
                }}
              />
            </li>
            <li className="v2-provider-hero__stat">
              <span className="v2-provider-hero__stat-label">{t('v2.providers.projects')}</span>
              <strong>{projects.toLocaleString()}</strong>
            </li>
            <li className="v2-provider-hero__stat" data-active={jobs > 0 ? '' : undefined}>
              <span className="v2-provider-hero__stat-label">{t('v2.providers.running')}</span>
              <strong>
                {jobs > 0 && <span className="v2-provider__pulse" aria-hidden />}
                {jobs.toLocaleString()}
              </strong>
            </li>
            <li className="v2-provider-hero__stat">
              <span className="v2-provider-hero__stat-label">{t('providerProfile.models')}</span>
              <strong>{provider.type === 'Civitai' ? t('v2.providers.catalog') : entries.length.toLocaleString()}</strong>
            </li>
            <li className="v2-provider-hero__stat" title={formatDateTime(provider.createdAt)}>
              <span className="v2-provider-hero__stat-label">{t('v2.providers.added')}</span>
              <strong className="v2-provider-hero__stat-text">{relativeTime(provider.createdAt, i18n.language)}</strong>
            </li>
          </ul>
        }
      />

      <section className="v2-provider-models" aria-label={t('providerProfile.supportedModels')}>
        {entries.length > 0 && (
          <div className="v2-results-head">
            <div className="v2-results-bar" data-density="compact">
              <SectionNav<View>
                scope="provider-models"
                label={t('v2.providers.kindsLabel')}
                value={view}
                onChange={(next) => update({ kind: next })}
                items={VIEWS.filter((value) => value === 'all' || entries.some((entry) => entry.kind === value)).map((value) => ({
                  value,
                  label: t(`v2.providers.kinds.${value}`),
                  icon: VIEW_ICONS[value],
                  count: counts[value],
                }))}
              />
              {checking && <LoadingIndicator size={24} aria-label={t('v2.providers.models.checking')} />}
              <span className="v2-results-bar__spacer" />
              {summary && <span className="v2-results-bar__summary">{summary}</span>}
              <div className="v2-results-bar__tools">
                <ResultsSearch value={q} onChange={setSearch} label={t('v2.providers.models.search')} />
                {canCheck && <IconButton icon="refresh" size="sm" label={t('v2.providers.models.recheck')} tooltip disabled={checking} onClick={() => void checkModels()} />}
              </div>
            </div>
          </div>
        )}

        {!provider.hasKey && !isStatic && (
          <div className="v2-notice v2-provider-models__notice" data-tone="warning">
            <Icon name="key_off" />
            <Text variant="body-medium" className="flex-1">
              {t('providerProfile.addKeyToFetch')}
            </Text>
            <Button variant="tonal" size="xs" icon="key" href={editHref}>
              {t('v2.providers.addKey')}
            </Button>
          </div>
        )}
        {modelsError && (
          <div className="v2-pane-inset">
            <ErrorState message={modelsError} onRetry={() => void checkModels()} retryLabel={t('v2.providers.retry')} />
          </div>
        )}

        {entries.length === 0 ? (
          <div className="v2-notice v2-provider-models__notice">
            <Icon name="info" />
            <Text variant="body-medium">{provider.type === 'Civitai' ? t('providerForm.civitaiModelsNote') : t('providerProfile.noModels')}</Text>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState
            className="v2-pane-empty"
            shape="puffy"
            icon="search_off"
            title={t('v2.providers.models.noMatches')}
            action={
              <Button variant="tonal" icon="filter_alt_off" onClick={() => update({ q: null, kind: null })}>
                {t('v2.project.clearFilters')}
              </Button>
            }
          />
        ) : (
          <div className="v2-provider-models__body">
            <ModelRows models={shown} onCopy={copy} />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        icon="delete"
        title={t('v2.providers.confirmDeleteOne', { name: provider.name })}
        message={`${t('providers.deleteDialog.message', { name: provider.name })}${usage}`}
        confirmLabel={t('providers.deleteDialog.confirm')}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteProvider(provider.id);
            snackbar.show(t('v2.providers.deleted', { name: provider.name }));
            navigate('/providers');
          } catch (err) {
            snackbar.show((err as Error).message || t('providers.errors.delete'));
          }
        }}
      />

      <PromptDialog
        open={renaming}
        icon="drive_file_rename_outline"
        title={t('v2.providers.renameTitle')}
        label={t('providerForm.nameLabel')}
        initialValue={provider.name}
        placeholder={t('providerForm.namePlaceholder')}
        confirmLabel={t('v2.providers.rename')}
        maxLength={120}
        onClose={() => setRenaming(false)}
        onConfirm={async (value) => {
          const name = value.trim();
          if (name === provider.name) return;
          try {
            await updateProvider(provider.id, { name });
            setProvider({ ...provider, name });
            snackbar.show(t('v2.providers.renamed', { name }));
          } catch (err) {
            snackbar.show((err as Error).message || t('v2.providers.saveFailed'));
            throw err;
          }
        }}
      />
    </Page>
  );
}
