import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { deleteProvider, fetchProviders, updateProvider } from '../../api';
import { Button, IconButton, MenuGroup, MenuItem, useSnackbar } from '../../m3';
import type { Provider } from '../../types';
import { DangerAction, ResultsBar, SectionNav } from '../components/project/ResultsBar';
import { ProviderItem } from '../components/providers/ProviderItem';
import { ProvidersHero } from '../components/providers/ProvidersHero';
import {
  activeJobCount,
  matchesQuery,
  matchesStatus,
  PROVIDER_KINDS,
  PROVIDER_SORTS,
  PROVIDER_STATUSES,
  projectCount,
  providerHasCredentials,
  providerKinds,
  type ProviderKind,
  type ProviderSort,
  type ProviderStatus,
} from '../components/providers/providerMeta';
import { ServiceGallery } from '../components/providers/ServiceGallery';
import { clampParallel, useParallelSaver } from '../components/providers/useParallelSaver';
import { useRangeSelection } from '../lib/useRangeSelection';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { HoverMenuButton } from '../ui/HoverMenuButton';
import { EmptyState, ErrorState, LoadingState, Page } from '../ui/Page';
import { PromptDialog } from '../ui/PromptDialog';
import { FilterChip, ResultsSearch } from '../ui/ResultFilters';

type View = 'all' | ProviderKind;
const VIEWS: View[] = ['all', ...PROVIDER_KINDS];
const VIEW_ICONS: Record<View, string> = { all: 'key', text: 'notes', image: 'image', video: 'movie', audio: 'music_note' };
const STATUS_ICONS: Record<ProviderStatus, string> = { all: 'filter_list', ready: 'verified', missing: 'key_off', used: 'folder', running: 'progress_activity' };
const QUEUE_HREF = '/projects/queues?view=providers';
/** How often usage refreshes while jobs are running. */
const LIVE_REFRESH_MS = 15000;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function Providers() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Search, kind, status and sort live in the URL.
  const q = params.get('q') ?? '';
  const view = pick(params.get('kind'), VIEWS, 'all');
  const status = pick(params.get('status'), PROVIDER_STATUSES, 'all');
  const sort = pick(params.get('sort'), Object.keys(PROVIDER_SORTS) as ProviderSort[], 'service');

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '' || value === 'all') next.delete(key);
            else next.set(key, value);
          }
          if (next.get('sort') === 'service') next.delete('sort');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const setSearch = useCallback((value: string) => update({ q: value.trim() }), [update]);

  // Every provider with its usage; the list is short, so filtering happens here.
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  // A failed save reloads the true count.
  const { schedule: scheduleParallel, isPending: parallelPending } = useParallelSaver(() => void load({ quiet: true }));

  const load = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      const id = ++request.current;
      if (!quiet) setLoading(true);
      try {
        const list = await fetchProviders();
        if (id !== request.current) return;
        // A count still waiting to be saved keeps the value on screen.
        setProviders((current) =>
          list.map((provider) => {
            const shown = parallelPending(provider.id) ? current?.find((item) => item.id === provider.id) : undefined;
            return shown ? { ...provider, concurrency: shown.concurrency } : provider;
          }),
        );
        setError('');
      } catch {
        if (id === request.current) setError(t('providers.errors.load'));
      } finally {
        if (id === request.current) setLoading(false);
      }
    },
    [t, parallelPending],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // Usage follows running jobs while there are any.
  const running = providers?.some((provider) => activeJobCount(provider) > 0) ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load({ quiet: true });
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [running, load]);

  const scoped = useMemo(() => (providers ?? []).filter((provider) => matchesQuery(provider, q) && matchesStatus(provider, status)), [providers, q, status]);
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: scoped.length, text: 0, image: 0, video: 0, audio: 0 };
    for (const provider of scoped) for (const kind of providerKinds(provider)) result[kind] += 1;
    return result;
  }, [scoped]);
  const shown = useMemo(() => scoped.filter((provider) => view === 'all' || providerKinds(provider).includes(view)).sort(PROVIDER_SORTS[sort].compare), [scoped, view, sort]);

  // Selection covers the providers in view; it clears whenever the list changes.
  const { selected, toggle, selectAll, clear: clearSelection } = useRangeSelection(shown, (provider) => provider.id, [q, view, status, sort]);
  const selectedProviders = useMemo(() => shown.filter((provider) => selected.has(provider.id)), [shown, selected]);

  const [pendingDelete, setPendingDelete] = useState<Provider[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<Provider | null>(null);

  const patchProvider = (id: string, patch: Partial<Provider>) => setProviders((list) => list?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ?? list);

  const changeConcurrency = (provider: Provider, value: number) => {
    const concurrency = clampParallel(value);
    patchProvider(provider.id, { concurrency });
    scheduleParallel(provider, concurrency);
  };

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.providers.copied')))
      .catch(() => snackbar.show(t('v2.providers.copyFailed')));
  };

  const openProvider = (provider: Provider) => navigate(`/provider/${provider.id}`);

  const itemMenu = (provider: Provider): ActionMenuItem[] => {
    const ready = providerHasCredentials(provider);
    return [
      { key: 'open', icon: 'arrow_forward', label: t('v2.providers.open'), onSelect: () => openProvider(provider) },
      { key: 'edit', icon: ready ? 'edit' : 'key', label: ready ? t('providerProfile.edit') : t('v2.providers.addKey'), href: `/provider/${provider.id}/edit` },
      { key: 'rename', icon: 'drive_file_rename_outline', label: t('v2.providers.rename'), onSelect: () => setRenameTarget(provider) },
      { key: 'custom', icon: 'layers', label: t('providerProfile.customModels'), href: `/provider/${provider.id}/custom-models`, hidden: provider.type !== 'BytePlus' },
      { key: 'queue', icon: 'monitoring', label: t('sidebar.queueMonitor'), href: QUEUE_HREF, hidden: activeJobCount(provider) === 0 },
      {
        key: 'select',
        icon: selected.has(provider.id) ? 'check_box' : 'check_box_outline_blank',
        label: t('v2.project.select'),
        type: 'checkbox',
        checked: selected.has(provider.id),
        divider: true,
        onSelect: () => toggle(provider.id, false),
      },
      { key: 'copy-id', icon: 'fingerprint', label: t('v2.providers.copyId'), onSelect: () => copy(provider.id) },
      { key: 'delete', icon: 'delete', label: t('providers.deleteDialog.confirm'), danger: true, divider: true, onSelect: () => setPendingDelete([provider]) },
    ];
  };

  const confirmDelete = async () => {
    const targets = pendingDelete;
    if (!targets?.length) return;
    let done = 0;
    let firstError = '';
    for (const provider of targets) {
      try {
        await deleteProvider(provider.id);
        done += 1;
      } catch (err) {
        firstError ||= targets.length > 1 ? `${provider.name}: ${(err as Error).message}` : (err as Error).message;
      }
    }
    const failed = targets.length - done;
    if (targets.length === 1) snackbar.show(failed ? firstError || t('providers.errors.delete') : t('v2.providers.deleted', { name: targets[0].name }));
    else snackbar.show(failed ? t('v2.providers.deletePartial', { done, failed, reason: firstError }) : t('v2.providers.deletedCount', { count: done }));
    clearSelection();
    await load({ quiet: true });
  };

  const deleteCopy = (() => {
    if (!pendingDelete?.length) return null;
    const projects = pendingDelete.reduce((sum, provider) => sum + projectCount(provider), 0);
    const jobs = pendingDelete.reduce((sum, provider) => sum + activeJobCount(provider), 0);
    const usage = projects > 0 || jobs > 0 ? t('providers.deleteDialog.usageWarning', { projectCount: projects, jobCount: jobs }) : '';
    return pendingDelete.length === 1
      ? { title: t('v2.providers.confirmDeleteOne', { name: pendingDelete[0].name }), message: `${t('providers.deleteDialog.message', { name: pendingDelete[0].name })}${usage}` }
      : { title: t('v2.providers.confirmDeleteMany', { count: pendingDelete.length }), message: `${t('v2.providers.confirmDeleteManyMessage')}${usage}` };
  })();

  const clearFilters = () => update({ q: null, status: null, kind: null });
  const runningInScope = scoped.some((provider) => activeJobCount(provider) > 0);

  const nav = (
    <SectionNav<View>
      scope="providers"
      label={t('v2.providers.kindsLabel')}
      value={view}
      onChange={(next) => update({ kind: next })}
      items={VIEWS.map((value) => ({
        value,
        label: t(`v2.providers.kinds.${value}`),
        icon: VIEW_ICONS[value],
        count: counts[value],
        signal: value === 'all' && runningInScope ? ('running' as const) : undefined,
      }))}
    />
  );

  const tools = (
    <>
      <ResultsSearch value={q} onChange={setSearch} label={t('v2.providers.search')} />
      <ActionMenu
        label={t('v2.providers.status')}
        icon="filter_list"
        variant={status === 'all' ? 'standard' : 'tonal'}
        openOnHover
        items={PROVIDER_STATUSES.map((value) => ({
          key: value,
          type: 'radio' as const,
          checked: status === value,
          icon: STATUS_ICONS[value],
          label: t(`v2.providers.statuses.${value}`),
          onSelect: () => update({ status: value }),
        }))}
      />
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.providers.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.providers.viewOptions')} />}>
        <MenuGroup label={t('v2.project.sort')}>
          {(Object.keys(PROVIDER_SORTS) as ProviderSort[]).map((value) => (
            <MenuItem key={value} type="radio" icon={PROVIDER_SORTS[value].icon} checked={sort === value} onSelect={() => update({ sort: value })}>
              {t(`v2.providers.sorts.${value}`)}
            </MenuItem>
          ))}
        </MenuGroup>
      </HoverMenuButton>
    </>
  );

  const chips = (q || status !== 'all') && (
    <>
      {q && <FilterChip label={`“${q}”`} removeLabel={t('v2.providers.clearSearch')} onRemove={() => update({ q: null })} />}
      {status !== 'all' && <FilterChip label={t(`v2.providers.statuses.${status}`)} removeLabel={t('v2.providers.clearStatus')} onRemove={() => update({ status: null })} />}
      <Button variant="text" size="xs" onClick={clearFilters}>
        {t('v2.project.clearFilters')}
      </Button>
    </>
  );

  // A kind nothing connected makes, with no other filter: offer the services that make it.
  const missingKind = view !== 'all' && counts[view] === 0 && !q && status === 'all' ? view : null;

  return (
    <Page className="v2-providers" density="compact">
      <ProvidersHero
        providers={providers}
        actions={
          <>
            <Button variant="filled" icon="add" emphasized href="/provider/new">
              {t('providers.newProvider')}
            </Button>
            <Button variant="tonal" icon="monitoring" href={QUEUE_HREF}>
              {t('sidebar.queueMonitor')}
            </Button>
          </>
        }
      />

      <section className="v2-providers-pane" aria-label={t('providers.allProviders')}>
        {providers && providers.length > 0 && (
          <ResultsBar
            nav={nav}
            totalCount={shown.length}
            selectedCount={selectedProviders.length}
            onToggleSelectAll={selectAll}
            onClearSelection={clearSelection}
            isLoading={loading}
            tools={tools}
            below={chips || undefined}
            menuItems={[
              { key: 'new', icon: 'add', label: t('providers.newProvider'), href: '/provider/new' },
              { key: 'queue', icon: 'monitoring', label: t('sidebar.queueMonitor'), href: QUEUE_HREF },
              { key: 'refresh', icon: 'refresh', label: t('v2.providers.refresh'), onSelect: () => void load() },
            ]}
            selectionActions={<DangerAction label={t('providers.deleteDialog.confirm')} onClick={() => setPendingDelete(selectedProviders)} />}
          />
        )}

        {error && (
          <div className="v2-pane-inset v2-providers-pane__error">
            <ErrorState message={error} onRetry={() => void load()} retryLabel={t('v2.providers.retry')} />
          </div>
        )}

        {providers === null ? (
          !error && <LoadingState />
        ) : providers.length === 0 ? (
          <ServiceGallery />
        ) : missingKind ? (
          <ServiceGallery kind={missingKind} />
        ) : shown.length === 0 ? (
          <EmptyState
            className="v2-pane-empty"
            shape="puffy"
            icon="search_off"
            title={t('v2.providers.noMatches')}
            description={t('v2.providers.noMatchesHint')}
            action={
              <Button variant="tonal" icon="filter_alt_off" onClick={clearFilters}>
                {t('v2.project.clearFilters')}
              </Button>
            }
          />
        ) : (
          <EntityList selecting={selected.size > 0} busy={loading}>
            {shown.map((provider) => (
              <ProviderItem
                key={provider.id}
                provider={provider}
                selected={selected.has(provider.id)}
                selecting={selected.size > 0}
                onToggleSelect={(range) => toggle(provider.id, range)}
                onOpen={() => openProvider(provider)}
                onConcurrencyChange={(value) => changeConcurrency(provider, value)}
                menuItems={itemMenu(provider)}
              />
            ))}
          </EntityList>
        )}
      </section>

      <ConfirmDialog
        open={deleteCopy !== null}
        tone="danger"
        icon="delete"
        title={deleteCopy?.title ?? ''}
        message={deleteCopy?.message}
        confirmLabel={t('providers.deleteDialog.confirm')}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <PromptDialog
        open={renameTarget !== null}
        icon="drive_file_rename_outline"
        title={t('v2.providers.renameTitle')}
        label={t('providerForm.nameLabel')}
        initialValue={renameTarget?.name ?? ''}
        placeholder={t('providerForm.namePlaceholder')}
        confirmLabel={t('v2.providers.rename')}
        maxLength={120}
        onClose={() => setRenameTarget(null)}
        onConfirm={async (value) => {
          const target = renameTarget;
          const name = value.trim();
          if (!target || name === target.name) return;
          try {
            await updateProvider(target.id, { name });
            patchProvider(target.id, { name });
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
