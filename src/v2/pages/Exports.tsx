import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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
import { Button, Dialog, Icon, IconButton, LinearProgress, Text } from '../../m3';
import type { DeliveryStatus, ExportTask } from '../../types';
import { ExportReleaseHistoryDialog } from '../components/exports/ExportReleaseHistoryDialog';
import { ExportsHero } from '../components/exports/ExportsHero';
import { driveIcon } from '../components/exports/releaseMeta';
import { runEach } from '../lib/bulk';
import { errorText } from '../lib/errors';
import { formatBytes, formatDateTime } from '../lib/format';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { PAGE_SIZES, useListParams } from '../lib/useListParams';
import { usePolling } from '../lib/usePolling';
import { useSelection } from '../lib/useSelection';
import { ChoiceTiles } from '../ui/ChoiceTiles';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList, EntityRow } from '../ui/EntityList';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { Page } from '../ui/Page';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

const EXPORT_HISTORY_PAGE_SIZE = 50;
/** How often work in flight is checked. */
const POLL_MS = 3000;

export function Exports() {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES });
  const { page } = list;
  const pageSize = list.pageSize === 'all' ? 500 : list.pageSize;
  const [toDelete, setToDelete] = useState<string[]>([]);
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
  const historySeq = useRef(0);
  const historyInflight = useRef<string | null>(null);

  // Uploads already in flight when the page opens, or started in another tab.
  const loadDeliveries = async () => {
    try {
      const active = await fetchActiveDeliveries();
      setDeliveries((prev) => ({ ...prev, ...Object.fromEntries(active.map((d) => [d.id, d])) }));
      setPendingDrive(Object.fromEntries(active.filter((d) => d.destination !== 'gumroad').map((d) => [d.exportTaskId, d.id])));
      setPendingGumroad(Object.fromEntries(active.filter((d) => d.destination === 'gumroad').map((d) => [d.exportTaskId, d.id])));
    } catch (error) {
      console.error('Failed to load deliveries:', error);
    }
  };

  // Archives still being built are checked again until they finish.
  const data = useAsyncData(() => fetchAllExports(page, pageSize), [page, pageSize], {
    pollMs: (current) => (current?.items.some((task) => task.status === 'pending' || task.status === 'processing') ? POLL_MS : false),
    onLoaded: () => void loadDeliveries(),
  });
  const exports = data.data?.items ?? [];
  const total = data.data?.total ?? 0;
  const activeCount = exports.filter((task) => task.status === 'pending' || task.status === 'processing').length;
  const selection = useSelection(exports, (task) => task.id, [page, pageSize]);

  const driveLabel = (platform: string) => providers.find((p) => p.id === platform)?.label ?? platform;
  const driveName = (drive: ReleaseConnection) => drive.displayName || drive.email || driveLabel(drive.platform);

  // Poll uploads in flight; read the latest statuses through a ref so polls never overlap.
  const tracked = [...Object.values(pendingDrive), ...Object.values(pendingGumroad)];
  const pollDeliveries = async () => {
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
    const ids = tracked.filter((dId) => {
      const d = deliveriesRef.current[dId];
      return !d || d.status === 'pending' || d.status === 'processing';
    });
    {
      for (const dId of ids) {
        try {
          const status = await fetchDeliveryStatus(dId);
          setDeliveries((prev) => ({ ...prev, [dId]: status }));
          if (status.status === 'completed' && !toasted.current.has(dId)) {
            toasted.current.add(dId);
            const gumroad = status.destination === 'gumroad';
            toast.success(gumroad ? t('sell.publishSuccess') : t('releases.drive.uploadSuccess'), {
              action: status.externalUrl ? { label: gumroad ? t('sell.openProduct') : t('releases.drive.openFile'), onClick: () => window.open(status.externalUrl!, '_blank', 'noopener,noreferrer') } : undefined,
            });
            invalidateHistory(status.exportTaskId);
            removePending(dId, status.destination);
          } else if (status.status === 'failed' && !toasted.current.has(dId)) {
            toasted.current.add(dId);
            toast.error(status.error || (status.destination === 'gumroad' ? t('sell.publishFailed') : t('releases.drive.uploadFailed')));
            invalidateHistory(status.exportTaskId);
            removePending(dId, status.destination);
          }
        } catch {
          // Transient errors: the next poll tries again.
        }
      }
    };
  };
  usePolling(pollDeliveries, tracked.length > 0 ? POLL_MS : false);
  const trackedKey = tracked.join('|');
  useEffect(() => {
    if (trackedKey) void pollDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedKey]);

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

  const target = (task: ExportTask) =>
    task.sourceType === 'library' && task.libraryId
      ? { to: `/library/${task.libraryId}`, label: t('libraries.title') }
      : { to: task.projectId ? `/project/${task.projectId}` : '/exports', label: t('projects.title') };

  const confirmDelete = async () => {
    if (toDelete.length === 0) return;
    const { done, failed } = await runEach(toDelete, deleteExport);
    if (done > 0) {
      if (toDelete.length > 1) toast.success(t('exports.selection.deleteSuccess', { count: done }));
      // Deleting everything on the last page would leave it empty; step back instead.
      if (exports.length <= done && page > 1) list.setPage(page - 1);
      else await data.reload(true);
    }
    if (failed > 0) toast.error(t('exports.selection.deleteFailed', { count: failed }));
  };

  const confirmDrive = async () => {
    const task = driveTask;
    if (!task || !driveId) return;
    if (pendingDrive[task.id]) return setDriveTask(null);
    const queued = await action.run(() => uploadExportToDrive(task.id, driveId), { key: `drive:${task.id}`, success: t('releases.drive.uploadQueued'), error: t('releases.drive.uploadFailed') });
    if (queued) setPendingDrive((prev) => ({ ...prev, [task.id]: queued.deliveryTaskId }));
    setDriveTask(null);
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
        setHistoryError(errorText(err, t('releases.history.loadError')));
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

  return (
    <Page className="v2-exports">
      <ExportsHero
        total={data.loading ? null : total}
        active={activeCount}
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
      />

      <ListPane
        label={t('sidebar.exports')}
        lead={<ListTitle title={t('sidebar.exports')} icon="folder_zip" count={total} />}
        loading={data.loading}
        refreshing={data.refreshing}
        error={data.error}
        onRetry={() => void data.reload()}
        count={exports.length}
        empty={{
          icon: 'folder_zip',
          shape: 'arch',
          title: t('exports.empty.title'),
          description: t('exports.empty.description'),
          action: (
            <Button variant="tonal" href="/projects">
              {t('exports.empty.viewProjects')}
            </Button>
          ),
        }}
        selection={selection}
        selectionActions={[{ key: 'delete', icon: 'delete', label: t('exports.selection.deleteSelected'), danger: true, onClick: () => setToDelete([...selection.selected]) }]}
        paging={{ page, pageSize: list.pageSize, total, pages: data.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
      >
            <EntityList selecting={selection.selecting}>

              {exports.map((task) => {
                const to = target(task);
                const isSelected = selection.isSelected(task.id);
                const drive = delivery(pendingDrive, task.id);
                const driveBusy = drive && (drive.status === 'pending' || drive.status === 'processing');
                const driveProgress = drive?.totalBytes ? Math.round((drive.bytesTransferred / drive.totalBytes) * 100) : 0;
                const gumroad = delivery(pendingGumroad, task.id);
                const gumroadBusy = gumroad && (gumroad.status === 'pending' || gumroad.status === 'processing');
                const gumroadProgress = gumroad?.totalBytes ? Math.round((gumroad.bytesTransferred / gumroad.totalBytes) * 100) : 0;
                const name = task.packageName || `Archive #${task.id.slice(0, 8)}`;
                return (
                  <EntityRow
                    key={task.id}
                    lead={() => (
                      <span className="v2-erow-thumb v2-erow-thumb--empty">
                        <Icon name="folder_zip" size={22} aria-hidden />
                      </span>
                    )}
                    title={name}
                    badges={task.sourceType === 'project-bundle' ? <StatusPill tone="tertiary">{t('projectImports.bundleBadge')}</StatusPill> : undefined}
                    detail={
                      <span className="v2-task__meta">
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
                            {formatBytes(task.size)}
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
                      </span>
                    }
                    actions={
                      <>
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
                      </>
                    }
                    selected={isSelected}
                    selecting={selection.selecting}
                    onToggleSelect={(range) => selection.toggle(task.id, range)}
                    selectLabel={isSelected ? t('exports.selection.deselectItem') : t('exports.selection.selectItem')}
                    ariaLabel={name}
                    failed={task.status === 'failed'}
                  />
                );
              })}
            </EntityList>
      </ListPane>

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
