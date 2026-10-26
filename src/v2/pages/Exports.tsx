import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  deleteExport,
  fetchActiveDeliveries,
  fetchAllExports,
  fetchDeliveryStatus,
  fetchReleaseConnections,
  fetchReleaseHistory,
  uploadExportToDrive,
  type ReleaseConnection,
  type ReleaseHistoryItem,
  type ReleaseProvider,
} from '../../api';
import { Button, Checkbox, Dialog, Icon, IconButton, LinearProgress, Text, useSnackbar } from '../../m3';
import type { DeliveryStatus, ExportTask } from '../../types';
import { ExportReleaseHistoryDialog } from '../components/exports/ExportReleaseHistoryDialog';
import { driveIcon } from '../components/exports/releaseMeta';
import { formatDateTime } from '../lib/format';
import { ChoiceTiles } from '../ui/ChoiceTiles';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { StatusPill } from '../ui/Stat';

const EXPORTS_PAGE_SIZE = 15;
const EXPORT_HISTORY_PAGE_SIZE = 50;

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return null;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  const value = bytes / 1024 ** index;
  return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0$/, ''))} ${sizes[index]}`;
}

export function Exports() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [exports, setExports] = useState<ExportTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [toDelete, setToDelete] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [driveTask, setDriveTask] = useState<ExportTask | null>(null);
  const [driveId, setDriveId] = useState<string | null>(null);
  const [historyTask, setHistoryTask] = useState<ExportTask | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, ReleaseHistoryItem[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, DeliveryStatus>>({});
  const deliveriesRef = useRef(deliveries);
  useEffect(() => {
    deliveriesRef.current = deliveries;
  }, [deliveries]);
  const toasted = useRef<Set<string>>(new Set());
  const [pendingDrive, setPendingDrive] = useState<Record<string, string>>({});
  const [pendingGumroad, setPendingGumroad] = useState<Record<string, string>>({});
  const [hasStores, setHasStores] = useState(false);
  const [drives, setDrives] = useState<ReleaseConnection[]>([]);
  const [providers, setProviders] = useState<ReleaseProvider[]>([]);
  const exportsSeq = useRef(0);
  const historySeq = useRef(0);
  const historyInflight = useRef<string | null>(null);
  const activeCount = exports.filter((task) => task.status === 'pending' || task.status === 'processing').length;

  const driveLabel = (platform: string) => providers.find((p) => p.id === platform)?.label ?? platform;
  const driveName = (drive: ReleaseConnection) => drive.displayName || drive.email || driveLabel(drive.platform);

  // Poll uploads in flight; read the latest statuses through a ref so polls never overlap.
  useEffect(() => {
    const tracked = [...Object.values(pendingDrive), ...Object.values(pendingGumroad)];
    if (tracked.length === 0) return;
    let cancelled = false;
    const removePending = (dId: string, destination: 'drive' | 'gumroad') =>
      (destination === 'gumroad' ? setPendingGumroad : setPendingDrive)((prev) => {
        const exportId = Object.entries(prev).find(([, v]) => v === dId)?.[0];
        if (!exportId) return prev;
        const next = { ...prev };
        delete next[exportId];
        return next;
      });
    const invalidateHistory = (exportTaskId: string) =>
      setHistoryCache((prev) => {
        if (!(exportTaskId in prev)) return prev;
        const next = { ...prev };
        delete next[exportTaskId];
        return next;
      });
    const poll = async () => {
      const ids = tracked.filter((dId) => {
        const d = deliveriesRef.current[dId];
        return !d || d.status === 'pending' || d.status === 'processing';
      });
      for (const dId of ids) {
        if (cancelled) return;
        try {
          const status = await fetchDeliveryStatus(dId);
          if (cancelled) return;
          setDeliveries((prev) => ({ ...prev, [dId]: status }));
          if (status.status === 'completed' && !toasted.current.has(dId)) {
            toasted.current.add(dId);
            const gumroad = status.destination === 'gumroad';
            snackbar.show({
              message: gumroad ? t('sell.publishSuccess') : t('releases.drive.uploadSuccess'),
              action: status.externalUrl
                ? { label: gumroad ? t('sell.openProduct') : t('releases.drive.openFile'), onClick: () => window.open(status.externalUrl!, '_blank', 'noopener,noreferrer') }
                : undefined,
            });
            invalidateHistory(status.exportTaskId);
            removePending(dId, status.destination);
          } else if (status.status === 'failed' && !toasted.current.has(dId)) {
            toasted.current.add(dId);
            snackbar.show(status.error || (status.destination === 'gumroad' ? t('sell.publishFailed') : t('releases.drive.uploadFailed')));
            invalidateHistory(status.exportTaskId);
            removePending(dId, status.destination);
          }
        } catch {
          // Transient errors: the next poll tries again.
        }
      }
    };
    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDrive, pendingGumroad, t]);

  useEffect(() => {
    let cancelled = false;
    fetchReleaseConnections()
      .then(({ connections, providers: available }) => {
        if (cancelled) return;
        setHasStores(connections.some((c) => c.kind === 'store'));
        setDrives(connections.filter((c) => c.kind === 'drive'));
        setProviders(available);
      })
      .catch(() => {
        if (cancelled) return;
        setHasStores(false);
        setDrives([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadExports = useCallback(async (pageToLoad: number, showLoading = true) => {
    const id = ++exportsSeq.current;
    try {
      if (showLoading) setLoading(true);
      const [{ items, total: nextTotal, pages: nextPages }, active] = await Promise.all([fetchAllExports(pageToLoad, EXPORTS_PAGE_SIZE), fetchActiveDeliveries()]);
      if (id !== exportsSeq.current) return;
      setExports(items);
      setTotal(nextTotal);
      setPages(nextPages);
      setSelected((prev) => {
        const visible = new Set(items.map((item) => item.id));
        const next = new Set([...prev].filter((v) => visible.has(v)));
        return next.size === prev.size ? prev : next;
      });
      setDeliveries((prev) => {
        const next = { ...prev };
        for (const d of active) next[d.id] = d;
        return next;
      });
      setPendingDrive(Object.fromEntries(active.filter((d) => d.destination !== 'gumroad').map((d) => [d.exportTaskId, d.id])));
      setPendingGumroad(Object.fromEntries(active.filter((d) => d.destination === 'gumroad').map((d) => [d.exportTaskId, d.id])));
    } catch (err) {
      console.error('Failed to load exports:', err);
    } finally {
      if (id === exportsSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExports(page);
  }, [loadExports, page]);

  useEffect(() => {
    if (activeCount === 0) return undefined;
    const interval = setInterval(() => void loadExports(page, false), 3000);
    return () => clearInterval(interval);
  }, [activeCount, loadExports, page]);

  const changePage = (next: number) => {
    setSelected(new Set());
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('page', String(next));
      return params;
    });
  };

  const target = (task: ExportTask) =>
    task.sourceType === 'library' && task.libraryId
      ? { to: `/library/${task.libraryId}`, label: t('libraries.title') }
      : { to: task.projectId ? `/project/${task.projectId}` : '/exports', label: t('projects.title') };

  const confirmDelete = async () => {
    if (toDelete.length === 0) return;
    const results = await Promise.allSettled(toDelete.map((id) => deleteExport(id)));
    const deleted = toDelete.filter((_, i) => results[i].status === 'fulfilled');
    const failed = toDelete.length - deleted.length;
    setSelected((prev) => {
      const next = new Set(prev);
      deleted.forEach((id) => next.delete(id));
      return next.size === prev.size ? prev : next;
    });
    if (deleted.length > 0) {
      if (toDelete.length > 1) snackbar.show(t('exports.selection.deleteSuccess', { count: deleted.length }));
      if (exports.length <= deleted.length && page > 1) changePage(page - 1);
      else await loadExports(page, false);
    }
    if (failed > 0) snackbar.show(t('exports.selection.deleteFailed', { count: failed }));
  };

  const confirmDrive = async () => {
    const task = driveTask;
    if (!task || !driveId) return;
    if (pendingDrive[task.id]) return setDriveTask(null);
    try {
      const { deliveryTaskId } = await uploadExportToDrive(task.id, driveId);
      setPendingDrive((prev) => ({ ...prev, [task.id]: deliveryTaskId }));
      snackbar.show(t('releases.drive.uploadQueued'));
    } catch (err) {
      snackbar.show((err as Error).message || t('releases.drive.uploadFailed'));
    } finally {
      setDriveTask(null);
    }
  };

  const loadHistory = useCallback(
    async (exportTaskId: string) => {
      const id = ++historySeq.current;
      historyInflight.current = exportTaskId;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const { items } = await fetchReleaseHistory(1, EXPORT_HISTORY_PAGE_SIZE, { exportTaskId });
        if (id !== historySeq.current) return;
        setHistoryCache((prev) => ({ ...prev, [exportTaskId]: items }));
      } catch (err) {
        if (id !== historySeq.current) return;
        setHistoryError((err as Error)?.message || t('releases.history.loadError'));
      } finally {
        if (id === historySeq.current) {
          historyInflight.current = null;
          setHistoryLoading(false);
        }
      }
    },
    [t],
  );

  useEffect(() => {
    if (!historyTask || historyError || historyCache[historyTask.id] || historyInflight.current === historyTask.id) return;
    void loadHistory(historyTask.id);
  }, [historyTask, historyCache, historyError, loadHistory]);

  const delivery = (map: Record<string, string>, exportId: string) => (map[exportId] ? (deliveries[map[exportId]] ?? null) : null);
  const allSelected = exports.length > 0 && selected.size === exports.length;

  return (
    <Page>
      <PageHeader
        size="large"
        title={t('exports.title')}
        description={t('exports.description')}
        actions={
          <>
            <Button variant="tonal" icon="rocket_launch" href="/exports/releases">
              {t('releases.headerLink')}
            </Button>
            <Button variant="tonal" icon="history" href="/exports/history">
              {t('releases.history.headerLink')}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <StatusPill icon="list">
            {total} {t('exports.stats.total')}
          </StatusPill>
          <StatusPill tone={activeCount > 0 ? 'primary' : 'neutral'} icon={activeCount > 0 ? 'progress_activity' : 'check_circle'}>
            {activeCount} {t('exports.stats.active')}
          </StatusPill>
        </div>
      </PageHeader>

      {!loading && exports.length === 0 ? (
        <EmptyState
          icon="folder_zip"
          shape="arch"
          title={t('exports.empty.title')}
          description={t('exports.empty.description')}
          action={
            <Button variant="tonal" href="/projects">
              {t('exports.empty.viewProjects')}
            </Button>
          }
        />
      ) : (
        <div data-density="compact">
          {exports.length > 0 && (
            <div className="v2-selection-bar">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.size > 0 && !allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(exports.map((task) => task.id)))}
                  label={allSelected ? t('exports.selection.deselectAll') : t('exports.selection.selectAll')}
                />
                {selected.size > 0 && <StatusPill tone="primary">{t('exports.selection.selected', { count: selected.size })}</StatusPill>}
              </div>
              <Button variant="tonal" size="xs" icon="delete" className="v2-button-danger" disabled={selected.size === 0} onClick={() => setToDelete([...selected])}>
                {t('exports.selection.deleteSelected')}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-2">
            {exports.map((task) => {
              const to = target(task);
              const isSelected = selected.has(task.id);
              const drive = delivery(pendingDrive, task.id);
              const driveBusy = drive && (drive.status === 'pending' || drive.status === 'processing');
              const driveProgress = drive?.totalBytes ? Math.round((drive.bytesTransferred / drive.totalBytes) * 100) : 0;
              const gumroad = delivery(pendingGumroad, task.id);
              const gumroadBusy = gumroad && (gumroad.status === 'pending' || gumroad.status === 'processing');
              const gumroadProgress = gumroad?.totalBytes ? Math.round((gumroad.bytesTransferred / gumroad.totalBytes) * 100) : 0;
              const name = task.packageName || `Archive #${task.id.slice(0, 8)}`;
              return (
                <div key={task.id} className="v2-task" data-selected={isSelected ? '' : undefined} data-failed={task.status === 'failed' ? '' : undefined}>
                  <Checkbox
                    checked={isSelected}
                    aria-label={isSelected ? t('exports.selection.deselectItem') : t('exports.selection.selectItem')}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      })
                    }
                  />
                  <div className="v2-task__body">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text as="span" variant="title-small" emphasized className="truncate">
                        {name}
                      </Text>
                      {task.sourceType === 'project-bundle' && <StatusPill tone="tertiary">{t('projectImports.bundleBadge')}</StatusPill>}
                    </div>
                    <div className="v2-task__meta">
                      <Link to={to.to} className="v2-link inline-flex items-center gap-1">
                        {to.label}: {task.projectName}
                        <Icon name="arrow_forward" size={14} className="m3-mirror-rtl" />
                      </Link>
                      <span>
                        <Icon name="schedule" size={14} />
                        {formatDateTime(task.createdAt)}
                      </span>
                      {task.status === 'completed' && task.size ? (
                        <span>
                          <Icon name="hard_drive" size={14} />
                          {formatSize(task.size)}
                        </span>
                      ) : null}
                      {task.status === 'completed' && (
                        <span>
                          <Icon name="list" size={14} />
                          {t('exports.card.files', { count: task.total })}
                        </span>
                      )}
                      {(task.status === 'processing' || task.status === 'pending') && (
                        <span className="v2-task__progress">
                          <LinearProgress value={task.status === 'pending' || task.total <= 0 ? 0 : (task.current / task.total) * 100} aria-label={name} />
                          {task.status === 'pending' ? t('exports.status.queued') : `${task.current}/${task.total}`}
                        </span>
                      )}
                      {driveBusy && (
                        <span className="v2-task__progress">
                          <LinearProgress value={drive?.status === 'pending' ? 5 : driveProgress} className="v2-progress-success" aria-label="Drive" />
                          {driveLabel(drive?.driveProvider || 'google-drive')}: {driveProgress}%
                        </span>
                      )}
                      {gumroadBusy && (
                        <span className="v2-task__progress">
                          <LinearProgress value={gumroad?.status === 'pending' ? 5 : gumroadProgress} aria-label="Gumroad" />
                          Gumroad: {gumroad?.phase ? gumroad.phase : `${gumroadProgress}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="v2-task__actions">
                    {task.status === 'completed' && <StatusPill tone="success" icon="check_circle">{t('exports.status.ready')}</StatusPill>}
                    {task.status === 'processing' && <StatusPill tone="primary" icon="progress_activity">{t('exports.status.archiving')}</StatusPill>}
                    {task.status === 'pending' && <StatusPill icon="hourglass_top">{t('exports.status.queued')}</StatusPill>}
                    {task.status === 'failed' && <StatusPill tone="error" icon="cancel">{t('exports.status.failed')}</StatusPill>}
                    {task.status === 'completed' && task.downloadUrl && (
                      <IconButton icon="download" label={t('exports.card.download')} tooltip size="xs" variant="tonal" href={task.downloadUrl} download />
                    )}
                    {task.status === 'completed' && drives.length > 0 && (
                      <IconButton
                        icon={driveBusy ? 'progress_activity' : 'cloud_upload'}
                        label={driveBusy ? t('releases.drive.uploading') : t('releases.drive.releaseToDrive')}
                        tooltip
                        size="xs"
                        disabled={!!driveBusy}
                        onClick={() => {
                          if (pendingDrive[task.id] || drives.length === 0) return;
                          setDriveId(drives.length === 1 ? drives[0].id : null);
                          setDriveTask(task);
                        }}
                      />
                    )}
                    {task.status === 'completed' && hasStores && (
                      <IconButton
                        icon={gumroadBusy ? 'progress_activity' : 'sell'}
                        label={gumroadBusy ? t('sell.publishing') : t('sell.sell')}
                        tooltip
                        size="xs"
                        disabled={!!gumroadBusy}
                        href={`/exports/${task.id}/sell`}
                      />
                    )}
                    {task.status === 'completed' && (drives.length > 0 || hasStores) && (
                      <IconButton
                        icon="history"
                        label={t('releases.history.exportDialog.open')}
                        tooltip
                        size="xs"
                        onClick={() => {
                          setHistoryError(null);
                          setHistoryTask(task);
                        }}
                      />
                    )}
                    <IconButton icon="delete" label={t('exports.card.delete')} tooltip size="xs" className="v2-button-danger" onClick={() => setToDelete([task.id])} />
                  </div>
                </div>
              );
            })}
          </div>
          {loading && <LoadingState minHeight={120} />}
          {pages > 1 && (
            <div className="v2-page-footer">
              <Pagination page={page} pages={pages} onPageChange={changePage} size="sm" />
              <Text variant="label-small" className="uppercase tracking-widest">
                {t('exports.pagination', { current: page, total: pages })}
              </Text>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={toDelete.length > 0}
        tone="danger"
        title={toDelete.length > 1 ? t('exports.deleteDialog.batchTitle') : t('exports.deleteDialog.title')}
        message={toDelete.length > 1 ? t('exports.deleteDialog.batchMessage', { count: toDelete.length }) : t('exports.deleteDialog.message')}
        confirmLabel={toDelete.length > 1 ? t('exports.deleteDialog.batchConfirm') : t('exports.deleteDialog.confirm')}
        onConfirm={confirmDelete}
        onClose={() => setToDelete([])}
      />

      <Dialog
        open={!!driveTask}
        onClose={() => setDriveTask(null)}
        icon="cloud_upload"
        headline={t('releases.drive.confirmDialog.title')}
        maxWidth={480}
        actions={
          <>
            <Button variant="text" onClick={() => setDriveTask(null)}>
              {t('releases.cancel')}
            </Button>
            <Button variant="filled" icon="upload" disabled={!driveId} onClick={() => void confirmDrive()}>
              {t('releases.drive.confirmDialog.confirm')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('releases.drive.confirmDialog.message', { name: driveTask?.packageName || `Archive #${driveTask?.id.slice(0, 8)}` })}
          </Text>
          <ChoiceTiles
            columns={1}
            size="compact"
            value={driveId ?? ''}
            onChange={setDriveId}
            options={drives.map((drive) => ({ value: drive.id, icon: driveIcon(drive.platform), label: driveName(drive), supportingText: driveLabel(drive.platform) }))}
          />
        </div>
      </Dialog>

      {historyTask && (
        <ExportReleaseHistoryDialog
          exportName={historyTask.packageName || `Archive #${historyTask.id.slice(0, 8)}`}
          items={historyCache[historyTask.id] ?? null}
          loading={historyLoading}
          error={historyError}
          onClose={() => setHistoryTask(null)}
          onRetry={() => {
            setHistoryError(null);
            void loadHistory(historyTask.id);
          }}
        />
      )}
    </Page>
  );
}
