import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { deleteProvider, fetchProviders, updateProvider } from '../../api';
import { Button, IconButton, MenuGroup, MenuItem } from '../../m3';
import type { Provider } from '../../types';
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
import { runEach } from '../lib/bulk';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useCopy } from '../lib/useCopy';
import { useListParams } from '../lib/useListParams';
import { useSelection } from '../lib/useSelection';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { HoverMenuButton } from '../ui/HoverMenuButton';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page } from '../ui/Page';
import { PromptDialog } from '../ui/PromptDialog';
import { FilterChip } from '../ui/ResultFilters';
import { useToast } from '../ui/useToast';

type View = 'all' | ProviderKind;
const VIEWS: View[] = ['all', ...PROVIDER_KINDS];
const VIEW_ICONS: Record<View, string> = { all: 'key', text: 'notes', image: 'image', video: 'movie', audio: 'music_note' };
const STATUS_ICONS: Record<ProviderStatus, string> = { all: 'filter_list', ready: 'verified', missing: 'key_off', used: 'folder', running: 'progress_activity' };
const QUEUE_HREF = '/projects/queues?view=providers';
/** How often usage refreshes while jobs are running. */
const LIVE_REFRESH_MS = 15000;

export function Providers() {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const copyText = useCopy();
  const navigate = useNavigate();

  // Search, kind, status and sort live in the URL.
  const list = useListParams({ defaults: { kind: 'all', status: 'all', sort: 'service' } });
  const { q } = list;
  const view = list.oneOf('kind', VIEWS);
  const status = list.oneOf('status', PROVIDER_STATUSES);
  const sort = list.oneOf('sort', Object.keys(PROVIDER_SORTS) as ProviderSort[]);

  // Every provider with its usage; the list is short, so filtering happens here.
  const shownRef = useRef<Provider[]>([]);
  // A failed save reloads the true count.
  const { schedule: scheduleParallel, isPending: parallelPending } = useParallelSaver(() => void data.reload(true));
  const data = useAsyncData(
    async () => {
      const fetched = await fetchProviders();
      // A count still waiting to be saved keeps the value on screen.
      return fetched.map((provider) => {
        const shown = parallelPending(provider.id) ? shownRef.current.find((item) => item.id === provider.id) : undefined;
        return shown ? { ...provider, concurrency: shown.concurrency } : provider;
      });
    },
    [],
    // Usage follows running jobs while there are any.
    { pollMs: (current) => (current?.some((provider) => activeJobCount(provider) > 0) ? LIVE_REFRESH_MS : false) },
  );
  const providers = data.data ?? null;
  shownRef.current = providers ?? [];

  const scoped = useMemo(() => (providers ?? []).filter((provider) => matchesQuery(provider, q) && matchesStatus(provider, status)), [providers, q, status]);
  const counts = useMemo(() => {
    const result: Record<View, number> = { all: scoped.length, text: 0, image: 0, video: 0, audio: 0 };
    for (const provider of scoped) for (const kind of providerKinds(provider)) result[kind] += 1;
    return result;
  }, [scoped]);
  const shown = useMemo(() => scoped.filter((provider) => view === 'all' || providerKinds(provider).includes(view)).sort(PROVIDER_SORTS[sort].compare), [scoped, view, sort]);

  // Selection covers the providers in view; it clears whenever the list changes.
  const selection = useSelection(shown, (provider) => provider.id, [q, view, status, sort]);

  const [pendingDelete, setPendingDelete] = useState<Provider[] | null>(null);
  const [renameTarget, setRenameTarget] = useState<Provider | null>(null);

  const patchProvider = (id: string, patch: Partial<Provider>) => data.setData((current) => current?.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const changeConcurrency = (provider: Provider, value: number) => {
    const concurrency = clampParallel(value);
    patchProvider(provider.id, { concurrency });
    scheduleParallel(provider, concurrency);
  };

  const copy = (text: string) => void copyText(text, t('v2.providers.copied'));

  const openProvider = (provider: Provider) => navigate(`/provider/${provider.id}`);

  const itemMenu = (provider: Provider): ActionMenuItem[] => {
    const ready = providerHasCredentials(provider);
    return [
      { key: 'open', icon: 'arrow_forward', label: t('v2.providers.open'), onSelect: () => openProvider(provider) },
      { key: 'edit', icon: ready ? 'edit' : 'key', label: ready ? t('providerProfile.edit') : t('v2.providers.addKey'), href: `/provider/${provider.id}/edit` },
      { key: 'rename', icon: 'drive_file_rename_outline', label: t('v2.providers.rename'), onSelect: () => setRenameTarget(provider) },
      { key: 'custom', icon: 'layers', label: t('providerProfile.customModels'), href: `/provider/${provider.id}/custom-models`, hidden: provider.type !== 'BytePlus' && provider.type !== 'APIMart' },
      { key: 'queue', icon: 'monitoring', label: t('sidebar.queueMonitor'), href: QUEUE_HREF, hidden: activeJobCount(provider) === 0 },
      {
        key: 'select',
        icon: selection.isSelected(provider.id) ? 'check_box' : 'check_box_outline_blank',
        label: t('v2.project.select'),
        type: 'checkbox',
        checked: selection.isSelected(provider.id),
        divider: true,
        onSelect: () => selection.toggle(provider.id),
      },
      { key: 'copy-id', icon: 'fingerprint', label: t('v2.providers.copyId'), onSelect: () => copy(provider.id) },
      { key: 'delete', icon: 'delete', label: t('providers.deleteDialog.confirm'), danger: true, divider: true, onSelect: () => setPendingDelete([provider]) },
    ];
  };

  const confirmDelete = async () => {
    const targets = pendingDelete;
    if (!targets?.length) return;
    const { done, failed, reason } = await runEach(targets, (provider) => deleteProvider(provider.id), (provider) => provider.name);
    if (failed === 0) toast.success(targets.length === 1 ? t('v2.providers.deleted', { name: targets[0].name }) : t('v2.providers.deletedCount', { count: done }));
    else toast.error(targets.length === 1 ? reason || t('providers.errors.delete') : t('v2.providers.deletePartial', { done, failed, reason }));
    selection.clear();
    await data.reload(true);
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

  const runningInScope = scoped.some((provider) => activeJobCount(provider) > 0);

  const nav = (
    <SectionNav<View>
      scope="providers"
      label={t('v2.providers.kindsLabel')}
      value={view}
      onChange={(next) => list.set({ kind: next })}
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
      <ListSearch value={q} onChange={list.setQuery} label={t('v2.providers.search')} />
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
          onSelect: () => list.set({ status: value }),
        }))}
      />
      <HoverMenuButton placement="bottom-end" aria-label={t('v2.providers.viewOptions')} trigger={(p) => <IconButton {...p} icon="tune" size="sm" label={t('v2.providers.viewOptions')} />}>
        <MenuGroup label={t('v2.project.sort')}>
          {(Object.keys(PROVIDER_SORTS) as ProviderSort[]).map((value) => (
            <MenuItem key={value} type="radio" icon={PROVIDER_SORTS[value].icon} checked={sort === value} onSelect={() => list.set({ sort: value })}>
              {t(`v2.providers.sorts.${value}`)}
            </MenuItem>
          ))}
        </MenuGroup>
      </HoverMenuButton>
    </>
  );

  const chips = (q || status !== 'all') && (
    <>
      {q && <FilterChip label={`“${q}”`} removeLabel={t('v2.providers.clearSearch')} onRemove={() => list.setQuery('')} />}
      {status !== 'all' && <FilterChip label={t(`v2.providers.statuses.${status}`)} removeLabel={t('v2.providers.clearStatus')} onRemove={() => list.set({ status: null })} />}
      <Button variant="text" size="xs" onClick={list.clearFilters}>
        {t('v2.common.clearFilters')}
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

      {providers !== null && providers.length === 0 ? (
        <section className="v2-list-pane" data-variant="surface" aria-label={t('providers.allProviders')}>
          <ServiceGallery />
        </section>
      ) : (
        <ListPane
          label={t('providers.allProviders')}
          lead={nav}
          fitKey={view}
          tools={tools}
          below={chips || undefined}
          menuItems={[
            { key: 'new', icon: 'add', label: t('providers.newProvider'), href: '/provider/new' },
            { key: 'queue', icon: 'monitoring', label: t('sidebar.queueMonitor'), href: QUEUE_HREF },
            { key: 'refresh', icon: 'refresh', label: t('v2.providers.refresh'), onSelect: () => void data.reload() },
          ]}
          loading={data.loading}
          refreshing={data.refreshing}
          error={data.error ? t('providers.errors.load') : null}
          onRetry={() => void data.reload()}
          count={shown.length}
          filtered
          onClearFilters={list.clearFilters}
          noMatches={{ title: t('v2.providers.noMatches'), description: t('v2.providers.noMatchesHint') }}
          empty={{ title: t('v2.providers.noMatches') }}
          instead={missingKind ? <ServiceGallery kind={missingKind} /> : undefined}
          selection={selection}
          selectionActions={[{ key: 'delete', icon: 'delete', label: t('providers.deleteDialog.confirm'), danger: true, onClick: () => setPendingDelete(selection.items) }]}
        >
          <EntityList selecting={selection.selecting} busy={data.refreshing}>
            {shown.map((provider) => (
              <ProviderItem
                key={provider.id}
                provider={provider}
                selected={selection.isSelected(provider.id)}
                selecting={selection.selecting}
                onToggleSelect={(range) => selection.toggle(provider.id, range)}
                onOpen={() => openProvider(provider)}
                onConcurrencyChange={(value) => changeConcurrency(provider, value)}
                menuItems={itemMenu(provider)}
              />
            ))}
          </EntityList>
        </ListPane>
      )}

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
          await action.run(
            async () => {
              await updateProvider(target.id, { name });
              patchProvider(target.id, { name });
            },
            { key: target.id, success: t('v2.providers.renamed', { name }), error: t('v2.providers.saveFailed'), rethrow: true },
          );
        }}
      />
    </Page>
  );
}
