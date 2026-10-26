import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Icon, LoadingIndicator, Ripple, Text } from '../../../m3';
import type { Library } from '../../../types';
import { kindMeta } from '../../ui/entityMeta';
import { EmptyState } from '../../ui/Page';
import { SearchField } from '../../ui/SearchField';
import { StatusPill } from '../../ui/Stat';

export interface LibrarySelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  libraries: Library[];
  /** Library ids already in the workflow; an id may appear more than once. */
  selectedLibraryIds: string[];
  isLoading?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
}

/** Picks a library: to add as a workflow step, to switch a step to, or to save an item into. */
export function LibrarySelectionDialog({ open, onClose, onSelect, libraries, selectedLibraryIds, isLoading = false, error = null, title, description }: LibrarySelectionDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? libraries.filter((lib) => lib.name.toLowerCase().includes(q)) : libraries;
  }, [libraries, query]);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selectedLibraryIds) counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, [selectedLibraryIds]);

  const typeLabel = (type: Library['type']) =>
    type === 'text' ? t('projectViewer.common.text') : type === 'image' ? t('projectViewer.common.imageShort') : type === 'video' ? t('projectViewer.common.video') : type === 'audio' ? t('projectViewer.common.audio') : type;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="library_books"
      headline={title || t('projectViewer.librarySelection.title')}
      fullScreen="compact"
      maxWidth={820}
      actions={
        <Button variant="text" onClick={onClose}>
          {t('projectViewer.common.cancel')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" data-density="compact">
        <Text variant="body-medium" className="text-on-surface-variant">
          {description || t('projectViewer.librarySelection.description')}
        </Text>
        {libraries.length > 0 && <SearchField value={query} onChange={setQuery} placeholder={t('projectViewer.librarySelection.searchPlaceholder')} shape="field" autoFocus />}
        {error && libraries.length > 0 && (
          <div className="v2-notice" data-tone="warning">
            <Icon name="warning" />
            <Text variant="body-small">{t('projectViewer.librarySelection.refreshFailed', { defaultValue: 'Could not refresh libraries. Showing the last loaded data.' })}</Text>
          </div>
        )}
        {isLoading && libraries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-on-surface-variant">
            <LoadingIndicator />
            <Text variant="label-medium">{t('projectViewer.librarySelection.loading', { defaultValue: 'Loading libraries...' })}</Text>
          </div>
        ) : libraries.length === 0 ? (
          <EmptyState icon="library_books" title={t('projectViewer.librarySelection.noLibraries')} size="inline" />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search_off" title={t('projectViewer.librarySelection.noResults', { query })} size="inline" />
        ) : (
          <div className="v2-pick-grid">
            {filtered.map((lib) => {
              const count = usage.get(lib.id) || 0;
              const cover = lib.coverUrl || (lib.type === 'image' ? lib.items[0]?.thumbnailUrl || lib.items[0]?.content : lib.items[0]?.thumbnailUrl);
              const meta = kindMeta(lib.type || 'text');
              return (
                <button key={lib.id} type="button" className="v2-pick-card m3-focus-ring" onClick={() => onSelect(lib.id)}>
                  <Ripple />
                  <span className="v2-pick-card__media">{(lib.type === 'image' || lib.type === 'video') && cover ? <img src={cover} alt="" loading="lazy" /> : <Icon name={meta.icon} />}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                    <span className="flex items-center justify-between gap-2">
                      <Text as="span" variant="title-small" emphasized className="truncate">
                        {lib.name}
                      </Text>
                      {count > 0 && (
                        <StatusPill tone="success" icon="check">
                          {t('projectViewer.librarySelection.added')}
                          {count > 1 ? ` ×${count}` : ''}
                        </StatusPill>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-on-surface-variant">
                      <Text as="span" variant="label-small" className="uppercase tracking-widest">
                        {typeLabel(lib.type)}
                      </Text>
                      <Text as="span" variant="label-small">
                        {t('projectViewer.workflow.itemsCount', { count: lib.itemCount ?? lib.items.length })}
                      </Text>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
