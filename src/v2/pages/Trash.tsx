import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteTrashBatch, deleteTrashPermanently, emptyTrash, fetchTrash, imageDisplayUrl, restoreTrashBatch, restoreTrashItem } from '../../api';
import { Button, Checkbox, Icon, IconButton, Text } from '../../m3';
import type { TrashItem } from '../../types';
import { Lightbox } from '../components/Lightbox';
import { formatDate } from '../lib/format';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

const formatSize = (bytes?: number) => (!bytes ? '0 KB' : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`);

export function Trash() {
  const { t } = useTranslation();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<'empty' | 'selected' | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setItems(await fetchTrash());
      } catch (e) {
        console.error('Failed to load trash:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const restore = async (id: string) => {
    try {
      await restoreTrashItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error('Restore failed:', e);
    }
  };

  const restoreSelected = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await restoreTrashBatch(ids);
      setItems((prev) => prev.filter((i) => !selected.has(i.id)));
      setSelected(new Set());
    } catch (e) {
      console.error('Batch restore failed:', e);
    }
  };

  const totalSize = items.reduce((acc, item) => acc + (item.size || 0), 0);
  const selectedSize = [...selected].reduce((acc, id) => acc + (items.find((i) => i.id === id)?.size || 0), 0);
  const withImages = items.filter((i) => i.imageUrl);

  return (
    <Page>
      <PageHeader size="large" title={t('trash.title')} description={t('trash.description')} />

      <div className="v2-selection-bar">
        <div className={`min-w-0 items-center gap-2 ${selected.size > 0 ? 'hidden sm:flex' : 'flex'}`}>
          <StatusPill icon="delete">{t('trash.stats.items', { count: items.length })}</StatusPill>
          <StatusPill tone="primary" icon="hard_drive">
            {t('trash.stats.total', { size: formatSize(totalSize) })}
          </StatusPill>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="tonal" size="xs" icon="restore" onClick={() => void restoreSelected()} title={t('trash.actions.restoreCount', { count: selected.size })}>
                <span className="hidden sm:inline">{t('trash.actions.restoreCount', { count: selected.size })}</span>
                <span className="sm:hidden">{selected.size}</span>
              </Button>
              <Button variant="tonal" size="xs" icon="delete_forever" className="v2-button-danger" onClick={() => setConfirm('selected')} aria-label={t('trash.actions.deletePermanently')}>
                <span className="hidden sm:inline">{t('trash.actions.deletePermanently')}</span>
              </Button>
            </>
          )}
          {items.length > 0 && (
            <Button variant="outlined" size="xs" icon="delete_sweep" onClick={() => setConfirm('empty')}>
              {t('trash.actions.emptyTrash')}
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="delete" shape="ghostish" title={t('trash.empty.title')} description={t('trash.empty.description')} />
      ) : (
        <div className="v2-trash-grid">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <div key={item.id} className="v2-trash-card" data-selected={isSelected ? '' : undefined}>
                <button
                  type="button"
                  className="v2-trash-card__media"
                  onClick={() => {
                    const idx = withImages.findIndex((i) => i.id === item.id);
                    setLightbox({ images: withImages.map((i) => imageDisplayUrl(i.optimizedUrl || i.imageUrl)), index: idx >= 0 ? idx : 0 });
                  }}
                >
                  {item.thumbnailUrl || item.imageUrl ? (
                    <img src={imageDisplayUrl(item.thumbnailUrl || item.imageUrl)} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-container-high p-4 text-on-surface-variant">
                      <Icon name="description" size={32} />
                    </div>
                  )}
                  <span className="v2-trash-card__scrim">
                    <Text as="span" variant="body-small" className="line-clamp-3">
                      {item.prompt}
                    </Text>
                    <Text as="span" variant="label-small" className="inline-flex items-center gap-1 opacity-80">
                      <Icon name="hard_drive" size={12} />
                      {formatSize(item.size)}
                    </Text>
                  </span>
                </button>
                <span className="v2-trash-card__check">
                  <Checkbox checked={isSelected} onChange={() => toggle(item.id)} aria-label={item.prompt || item.id} />
                </span>
                <div className="v2-trash-card__info">
                  <Text as="div" variant="label-medium" className="flex min-w-0 items-center gap-1 text-on-surface-variant" title={item.projectName}>
                    <Icon name="folder" size={14} className="text-primary" />
                    <span className="truncate">{item.projectName}</span>
                  </Text>
                  <div className="flex items-center justify-between gap-2">
                    <Text as="span" variant="label-small" className="inline-flex items-center gap-1 text-on-surface-variant">
                      <Icon name="calendar_today" size={12} />
                      {formatDate(item.deletedAt)}
                    </Text>
                    <span className="flex">
                      <IconButton icon="restore" label={t('trash.card.restore')} tooltip size="xs" onClick={() => void restore(item.id)} />
                      <IconButton icon="delete_forever" label={t('trash.card.delete')} tooltip size="xs" className="v2-button-danger" onClick={() => setToDelete(item.id)} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'empty'}
        tone="danger"
        title={t('trash.confirm.empty.title')}
        message={t('trash.confirm.empty.message', { count: items.length, size: formatSize(totalSize) })}
        confirmLabel={t('trash.confirm.empty.confirm')}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await emptyTrash();
            setItems([]);
            setSelected(new Set());
          } catch (e) {
            console.error('Empty trash failed:', e);
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'selected'}
        tone="danger"
        title={t('trash.confirm.deleteSelected.title')}
        message={t('trash.confirm.deleteSelected.message', { count: selected.size, size: formatSize(selectedSize) })}
        confirmLabel={t('trash.confirm.deleteSelected.confirm')}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const ids = [...selected];
          if (ids.length === 0) return;
          try {
            await deleteTrashBatch(ids);
            setItems((prev) => prev.filter((i) => !selected.has(i.id)));
            setSelected(new Set());
          } catch (e) {
            console.error('Batch delete failed:', e);
          }
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        title={t('trash.confirm.deleteSingle.title')}
        message={t('trash.confirm.deleteSingle.message')}
        confirmLabel={t('trash.confirm.deleteSingle.confirm')}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteTrashPermanently(toDelete);
            setItems((prev) => prev.filter((i) => i.id !== toDelete));
          } catch (e) {
            console.error('Delete failed:', e);
          }
        }}
      />
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </Page>
  );
}
