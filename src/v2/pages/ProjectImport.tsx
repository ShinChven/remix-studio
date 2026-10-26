import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { deleteProjectImport, fetchProjectImports, uploadProjectBundle } from '../../api';
import { Icon, IconButton, LinearProgress, Text, useSnackbar } from '../../m3';
import type { ProjectImportTask } from '../../types';
import { formatDateTime } from '../lib/format';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DropZone } from '../ui/DropZone';
import { Page, PageHeader } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

const IMPORTS_PAGE_SIZE = 5;
const POLL_INTERVAL_MS = 3000;

function formatSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${parseFloat(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2))} ${units[index]}`;
}

/** Upload a project bundle and watch it unpack. */
export function ProjectImport() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [imports, setImports] = useState<ProjectImportTask[]>([]);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  // Finished imports already announced; the first load only seeds this, so old ones stay quiet.
  const announced = useRef<Set<string>>(new Set());
  const seeded = useRef(false);
  const hasActive = imports.some((task) => task.status === 'pending' || task.status === 'processing');
  const uploading = uploadPercent !== null;

  const load = useCallback(async () => {
    try {
      const { items } = await fetchProjectImports(1, IMPORTS_PAGE_SIZE);
      setImports(items);
      const seeding = !seeded.current;
      seeded.current = true;
      for (const task of items) {
        if ((task.status !== 'completed' && task.status !== 'failed') || announced.current.has(task.id)) continue;
        announced.current.add(task.id);
        if (seeding) continue;
        snackbar.show(task.status === 'completed' ? t('projectImports.toast.completed', { name: task.projectName || '' }) : task.error || t('projectImports.toast.failed'));
      }
    } catch (err) {
      console.error('Failed to load project imports:', err);
    }
  }, [snackbar, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasActive) return undefined;
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActive, load]);

  const upload = async (file: File) => {
    if (uploading) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      snackbar.show(t('projectImports.errors.notZip'));
      return;
    }
    setUploadPercent(0);
    try {
      await uploadProjectBundle(file, { onProgress: setUploadPercent });
      snackbar.show(t('projectImports.toast.queued'));
      await load();
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') snackbar.show((err as Error)?.message || t('projectImports.errors.uploadFailed'));
    } finally {
      setUploadPercent(null);
    }
  };

  return (
    <Page width="default">
      <PageHeader title={t('projectImports.title')} description={t('projectImports.description')} backLink={{ to: '/projects', label: t('projectImports.backToProjects') }} />
      <div className="flex flex-col gap-3" data-density="compact">
        <DropZone
          icon="folder_zip"
          title={t('projectImports.dropzone.title')}
          hint={t('projectImports.dropzone.hint')}
          accept=".zip,application/zip"
          buttonLabel={uploading ? t('projectImports.uploading', { percent: uploadPercent ?? 0 }) : t('projectImports.selectFile')}
          busy={uploading}
          progress={uploadPercent}
          onFiles={(files) => void upload(files[0])}
        />
        {imports.map((task) => {
          const percent = task.total > 0 ? Math.round((task.current / task.total) * 100) : 0;
          const running = task.status === 'pending' || task.status === 'processing';
          return (
            <div key={task.id} className="v2-task" data-failed={task.status === 'failed' ? '' : undefined}>
              <div className="v2-task__body">
                <div className="flex flex-wrap items-center gap-2">
                  {task.projectId ? (
                    <Link to={`/project/${task.projectId}`} className="v2-link inline-flex items-center gap-1">
                      <Text as="span" variant="title-small" emphasized>
                        {task.projectName || t('projectImports.untitled')}
                      </Text>
                      <Icon name="arrow_forward" size={16} className="m3-mirror-rtl" />
                    </Link>
                  ) : (
                    <Text as="span" variant="title-small" emphasized>
                      {task.projectName || t('projectImports.untitled')}
                    </Text>
                  )}
                  <Text as="span" variant="body-small" className="truncate text-on-surface-variant">
                    {task.fileName || 'bundle.zip'}
                  </Text>
                </div>
                <div className="v2-task__meta">
                  <span>
                    <Icon name="schedule" size={14} />
                    {formatDateTime(task.createdAt)}
                  </span>
                  {formatSize(task.size) && <span>{formatSize(task.size)}</span>}
                  {running && (
                    <span className="v2-task__progress">
                      <LinearProgress value={task.status === 'pending' ? 0 : percent} aria-label={task.fileName || 'bundle.zip'} />
                      {task.status === 'pending' ? t('projectImports.status.queued') : `${task.current}/${task.total}`}
                    </span>
                  )}
                  {task.status === 'failed' && task.error && <span className="text-error">{task.error}</span>}
                </div>
              </div>
              <div className="v2-task__actions">
                {task.status === 'completed' && <StatusPill tone="success" icon="check_circle">{t('projectImports.status.imported')}</StatusPill>}
                {task.status === 'processing' && <StatusPill tone="tertiary" icon="progress_activity">{t('projectImports.status.unpacking')}</StatusPill>}
                {task.status === 'pending' && <StatusPill icon="hourglass_top">{t('projectImports.status.queued')}</StatusPill>}
                {task.status === 'failed' && <StatusPill tone="error" icon="cancel">{t('projectImports.status.failed')}</StatusPill>}
                <IconButton icon="delete" label={t('projectImports.deleteRecord')} tooltip size="xs" className="v2-button-danger" disabled={task.status === 'processing'} onClick={() => setToDelete(task.id)} />
              </div>
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title={t('projectImports.confirmDelete.title')}
        message={t('projectImports.confirmDelete.message')}
        confirmLabel={t('projectImports.confirmDelete.confirm')}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteProjectImport(toDelete);
            setImports((prev) => prev.filter((task) => task.id !== toDelete));
          } catch (err) {
            snackbar.show((err as Error)?.message || t('projectImports.errors.deleteFailed'));
          }
        }}
      />
    </Page>
  );
}
