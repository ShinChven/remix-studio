import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { deleteProjectOrphansBatch, fetchProject, fetchProjectOrphans } from '../../api';
import { Checkbox, IconButton, Text } from '../../m3';
import { Lightbox } from '../components/Lightbox';
import { formatBytes } from '../lib/format';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useSelection } from '../lib/useSelection';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { Page, PageHeader } from '../ui/Page';
import { StatTile, StatusPill } from '../ui/Stat';

/** Files in a project's storage that nothing refers to any more, to review and delete. */
export function ProjectOrphans() {
  const { t } = useTranslation();
  const action = useAction();
  const { id } = useParams();
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const project = useAsyncData(() => fetchProject(id!), [id], { enabled: !!id });
  const files = useAsyncData(() => fetchProjectOrphans(id!), [id], { enabled: !!id });
  const orphans = files.data ?? [];
  const selection = useSelection(orphans, (file) => file.key, [id]);

  const sizeOf = (bytes?: number) => (bytes === undefined ? t('projectOrphans.unknownSize') : formatBytes(bytes));
  const totalSize = orphans.reduce((sum, file) => sum + (file.size || 0), 0);

  return (
    <Page density="compact">
      <PageHeader
        backLink={{ to: `/project/${id}`, label: t('projectOrphans.backToProject') }}
        title={t('projectOrphans.title')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone="primary">{t('projectOrphans.cleanupTool')}</StatusPill>
            {t('projectOrphans.projectLabel', { name: project.data?.name || id })}
          </span>
        }
      />
      <div className="v2-stat-grid mb-6">
        <StatTile icon="layers" label={t('projectOrphans.orphanedFiles')} value={orphans.length} tone="primary" />
        <StatTile icon="image" label={t('projectOrphans.totalWaste')} value={formatBytes(totalSize)} tone="tertiary" />
        <StatTile icon="warning" label={t('projectOrphans.warning')} value={<span className="m3-typescale-body-small">{t('projectOrphans.warningDesc')}</span>} tone="warning" />
      </div>

      <ListPane
        label={t('projectOrphans.orphanedFiles')}
        lead={<ListTitle title={t('projectOrphans.orphanedFiles')} icon="layers" count={orphans.length} />}
        tools={<IconButton icon="refresh" size="sm" label={t('projectOrphans.refresh')} tooltip disabled={files.refreshing} onClick={() => void files.reload()} />}
        menuItems={orphans.length > 0 ? [{ key: 'clear', icon: 'delete_sweep', label: t('projectOrphans.clearAll'), danger: true, onSelect: () => setConfirm(orphans.map((file) => file.key)) }] : []}
        loading={files.loading}
        refreshing={files.refreshing}
        error={files.error}
        onRetry={() => void files.reload()}
        count={orphans.length}
        empty={{ icon: 'check_circle', shape: 'sunny', title: t('projectOrphans.cleanTitle'), description: t('projectOrphans.cleanDesc') }}
        selection={selection}
        selectionActions={[{ key: 'delete', icon: 'delete', label: t('projectOrphans.deleteSelected', { count: selection.count }), danger: true, onClick: () => setConfirm([...selection.selected]) }]}
      >
        <div className="v2-orphan-grid v2-list-pane__grid">
          {orphans.map((file, index) => {
            const isSelected = selection.isSelected(file.key);
            const name = file.key.split('/').pop() || file.key;
            return (
              <div key={file.key} className="v2-orphan-card" data-selected={isSelected ? '' : undefined}>
                <button type="button" className="v2-orphan-card__media m3-focus-ring" onClick={(event) => (selection.selecting || event.shiftKey || event.metaKey || event.ctrlKey ? selection.toggle(file.key, event.shiftKey) : setLightbox(index))}>
                  <img src={file.url} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" />
                  <span className="v2-orphan-card__scrim">
                    <Text as="span" variant="label-small" className="truncate">
                      {name}
                    </Text>
                    <Text as="span" variant="label-small" className="opacity-80">
                      {sizeOf(file.size)}
                    </Text>
                  </span>
                </button>
                <span className="v2-orphan-card__check">
                  <Checkbox checked={isSelected} onChange={() => selection.toggle(file.key)} aria-label={name} />
                </span>
                <span className="v2-orphan-card__open">
                  <IconButton icon="open_in_new" variant="tonal" label={t('projectViewer.album.openOriginal')} tooltip size="xs" href={file.url} target="_blank" rel="noreferrer" />
                </span>
              </div>
            );
          })}
        </div>
      </ListPane>

      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        title={t('projectOrphans.confirm.title')}
        message={t('projectOrphans.confirm.message', { count: confirm?.length ?? 0 })}
        confirmLabel={t('projectOrphans.confirm.confirmText')}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!id || !confirm?.length) return;
          await action.run(
            async () => {
              await deleteProjectOrphansBatch(id, confirm);
              selection.clear();
              await files.reload(true);
            },
            { key: 'delete', rethrow: true },
          );
        }}
      />
      {lightbox !== null && <Lightbox images={orphans.map((file) => file.url)} startIndex={lightbox} onClose={() => setLightbox(null)} />}
    </Page>
  );
}
