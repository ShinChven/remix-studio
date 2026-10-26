import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { deleteProjectOrphansBatch, fetchProject, fetchProjectOrphans, type OrphanFile } from '../../api';
import { Button, Checkbox, IconButton, Text, useSnackbar } from '../../m3';
import type { Project } from '../../types';
import { Lightbox } from '../components/Lightbox';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { StatTile, StatusPill } from '../ui/Stat';

export function ProjectOrphans() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [orphans, setOrphans] = useState<OrphanFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [proj, files] = await Promise.all([fetchProject(id), fetchProjectOrphans(id)]);
      setProject(proj);
      setOrphans(files);
      setSelected(new Set());
      setLastKey(null);
    } catch (e) {
      console.error('Failed to load orphan data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggle = (key: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastKey) {
        const a = orphans.findIndex((o) => o.key === key);
        const b = orphans.findIndex((o) => o.key === lastKey);
        if (a !== -1 && b !== -1) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(orphans[i].key);
      } else if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setLastKey(key);
  };

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return t('projectOrphans.unknownSize');
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / 1024 ** i).toFixed(2))} ${['B', 'KB', 'MB', 'GB'][i]}`;
  };

  if (loading && !project) return <LoadingState label={t('projectOrphans.scanning')} minHeight={400} />;
  const totalSize = orphans.reduce((acc, o) => acc + (o.size || 0), 0);

  return (
    <Page density="compact">
      <PageHeader
        backLink={{ to: `/project/${id}`, label: t('projectOrphans.backToProject') }}
        title={t('projectOrphans.title')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone="primary">{t('projectOrphans.cleanupTool')}</StatusPill>
            {t('projectOrphans.projectLabel', { name: project?.name || id })}
          </span>
        }
        actions={
          <>
            <IconButton icon="refresh" label={t('projectOrphans.refresh')} tooltip variant="tonal" disabled={loading} onClick={() => void load()} />
            {orphans.length > 0 && (
              <Button
                variant="filled"
                icon="delete"
                className="v2-button-danger"
                onClick={() => {
                  if (selected.size === 0) setSelected(new Set(orphans.map((o) => o.key)));
                  setConfirm(true);
                }}
              >
                {selected.size > 0 ? t('projectOrphans.deleteSelected', { count: selected.size }) : t('projectOrphans.clearAll')}
              </Button>
            )}
          </>
        }
      />
      <div className="v2-stat-grid mb-6">
        <StatTile icon="layers" label={t('projectOrphans.orphanedFiles')} value={orphans.length} tone="primary" />
        <StatTile icon="image" label={t('projectOrphans.totalWaste')} value={formatSize(totalSize)} tone="tertiary" />
        <StatTile icon="warning" label={t('projectOrphans.warning')} value={<span className="m3-typescale-body-small">{t('projectOrphans.warningDesc')}</span>} tone="warning" />
      </div>
      {orphans.length > 0 && (
        <div className="v2-selection-bar">
          <Checkbox
            label={t('projectOrphans.selectAll')}
            checked={selected.size === orphans.length}
            indeterminate={selected.size > 0 && selected.size < orphans.length}
            onChange={() => {
              setSelected(selected.size === orphans.length ? new Set() : new Set(orphans.map((o) => o.key)));
              setLastKey(null);
            }}
          />
          {selected.size > 0 && <StatusPill tone="primary">{t('projectOrphans.filesSelected', { count: selected.size })}</StatusPill>}
        </div>
      )}
      {orphans.length === 0 ? (
        <EmptyState icon="check_circle" shape="sunny" title={t('projectOrphans.cleanTitle')} description={t('projectOrphans.cleanDesc')} />
      ) : (
        <div className="v2-trash-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
          {orphans.map((file, idx) => {
            const isSelected = selected.has(file.key);
            const name = file.key.split('/').pop() || 'file';
            return (
              <div key={file.key} className="v2-trash-card" data-selected={isSelected ? '' : undefined}>
                <button type="button" className="v2-trash-card__media" style={{ cursor: 'pointer' }} onClick={(e) => toggle(file.key, e.shiftKey)}>
                  <img src={file.url} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                  <span className="v2-trash-card__scrim">
                    <Text as="span" variant="label-small" className="truncate">
                      {name}
                    </Text>
                    <Text as="span" variant="label-small" className="opacity-80">
                      {formatSize(file.size)}
                    </Text>
                  </span>
                </button>
                <span className="v2-trash-card__check">
                  <Checkbox checked={isSelected} onChange={() => toggle(file.key, false)} aria-label={name} />
                </span>
                <div className="flex items-center justify-end gap-1 px-2 py-1">
                  <IconButton icon="open_in_new" label="Open" size="xs" href={file.url} target="_blank" rel="noreferrer" />
                  <Button variant="text" size="xs" icon="zoom_in" onClick={() => setLightbox({ images: orphans.map((o) => o.url), index: idx })}>
                    {t('projectOrphans.preview')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        tone="danger"
        title={t('projectOrphans.confirm.title')}
        message={t('projectOrphans.confirm.message', { count: selected.size > 0 ? selected.size : orphans.length })}
        confirmLabel={t('projectOrphans.confirm.confirmText')}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (!id || selected.size === 0) return;
          try {
            await deleteProjectOrphansBatch(id, [...selected]);
            await load();
          } catch (e) {
            console.error('Failed to delete orphans:', e);
            snackbar.show(`Failed to delete some files: ${(e as Error).message}`);
          }
        }}
      />
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </Page>
  );
}

