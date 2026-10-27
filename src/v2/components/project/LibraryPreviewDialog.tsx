import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { imageDisplayUrl } from '../../../api';
import { filterItemsByTags } from '../../../lib/remixEngine';
import { Button, Dialog, IconButton, LoadingIndicator, Ripple, Text } from '../../../m3';
import { KindBadge } from '../../ui/KindBadge';
import type { Library, LibraryItem } from '../../../types';
import { EmptyState } from '../../ui/Page';
import { SearchField } from '../../ui/SearchField';
import { TagFilter, tagFacetsFromItems } from '../../ui/TagFilter';
import { Lightbox } from '../Lightbox';

export interface LibraryPreviewDialogProps {
  library: Library | null;
  selectedTags: string[];
  onUpdateTags: (tags: string[]) => void;
  tagMatchMode?: 'and' | 'or';
  onUpdateTagMatchMode?: (mode: 'and' | 'or') => void;
  onClose: () => void;
  /** Picking an item fills a workflow step instead of browsing. */
  isSelectionMode?: boolean;
  onSelectItem?: (content: string) => void;
  /** The items are still loading; the library shows by name until they arrive. */
  isLoading?: boolean;
}

/** Browses the library a workflow step draws from and sets the step's tag filter. */
export function LibraryPreviewDialog({ library, selectedTags, onUpdateTags, tagMatchMode = 'or', onUpdateTagMatchMode, onClose, isSelectionMode = false, onSelectItem, isLoading = false }: LibraryPreviewDialogProps) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => setQuery(''), [library?.id]);

  const facets = useMemo(() => (library ? tagFacetsFromItems(library.items) : []), [library]);
  const items = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return filterItemsByTags(library.items, selectedTags, tagMatchMode).filter(
      (item) => !q || item.title?.toLowerCase().includes(q) || item.content?.toLowerCase().includes(q) || item.tags?.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [library, selectedTags, query, tagMatchMode]);

  const pick = (item: LibraryItem) => {
    if (isSelectionMode && onSelectItem) {
      onSelectItem(item.content);
      return true;
    }
    return false;
  };

  return (
    <>
      <Dialog
        open={library !== null}
        onClose={onClose}
        icon="library_books"
        headline={library?.name}
        fullScreen="compact"
        maxWidth={1040}
        actions={
          library && (
            <>
              <Button variant="text" onClick={onClose}>
                {t('projectViewer.libraryPreview.closeViewer')}
              </Button>
              {!isSelectionMode && (
                <Button variant="filled" icon="open_in_new" href={`/library/${library.id}`} onClick={onClose}>
                  {t('projectViewer.libraryPreview.openFullLibrary')}
                </Button>
              )}
            </>
          )
        }
      >
        {library && (
          <div className="flex flex-col gap-3" data-density="compact">
            {library.description && (
              <Text variant="body-small" className="line-clamp-2 text-on-surface-variant">
                {library.description}
              </Text>
            )}
            <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {t('projectViewer.libraryPreview.itemsSummary', { filtered: items.length, total: isLoading ? (library.itemCount ?? library.items.length) : library.items.length })}
            </Text>
            {library.items.length > 0 && <SearchField value={query} onChange={setQuery} placeholder={t('projectViewer.libraryPreview.searchPlaceholder')} shape="field" autoFocus={isSelectionMode} />}
            <TagFilter tags={facets} selected={selectedTags} onChange={onUpdateTags} matchMode={tagMatchMode} onMatchModeChange={onUpdateTagMatchMode} storageKey={`library-preview:${library.id}`} />
            {isLoading && library.items.length === 0 ? (
              <div className="flex justify-center py-16">
                <LoadingIndicator />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon="filter_alt_off"
                size="inline"
                title={t('projectViewer.libraryPreview.noItemsMatch')}
                action={
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => {
                      onUpdateTags([]);
                      setQuery('');
                    }}
                  >
                    {t('projectViewer.libraryPreview.clearAllFilters')}
                  </Button>
                }
              />
            ) : library.type === 'text' ? (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <TextItem key={item.id} item={item} isSelectionMode={isSelectionMode} onSelect={() => pick(item)} />
                ))}
              </div>
            ) : (
              <div className="v2-tile-grid" style={{ ['--v2-tile-min' as string]: '180px' }}>
                {items.map((item) => (
                  <div key={item.id} className="v2-preview-card">
                    <button
                      type="button"
                      className="v2-preview-card__media m3-focus-ring"
                      data-aspect={library.type === 'audio' ? 'wide' : undefined}
                      onClick={() => {
                        if (pick(item) || library.type !== 'image') return;
                        const images = library.items.filter((i) => i.content).map((i) => imageDisplayUrl(i.optimizedUrl || i.content));
                        const idx = images.indexOf(imageDisplayUrl(item.optimizedUrl || item.content));
                        setLightbox({ images, index: idx >= 0 ? idx : 0 });
                      }}
                    >
                      {library.type === 'image' ? (
                        <img src={imageDisplayUrl(item.thumbnailUrl || item.content)} alt="" loading="lazy" />
                      ) : library.type === 'video' && item.thumbnailUrl ? (
                        <img src={imageDisplayUrl(item.thumbnailUrl)} alt="" loading="lazy" />
                      ) : (
                        <KindBadge kind={library.type === 'video' ? 'video' : 'audio'} size={48} />
                      )}
                      {isSelectionMode && <span className="v2-preview-card__pick">{t('projectViewer.libraryPreview.clickToSelect')}</span>}
                    </button>
                    <div className="flex flex-col gap-1 p-2">
                      {item.title && (
                        <Text variant="label-small" emphasized className="truncate uppercase tracking-widest text-primary">
                          {item.title}
                        </Text>
                      )}
                      <Text variant="body-small" className="truncate italic text-on-surface-variant">
                        {item.content}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </>
  );
}

function TextItem({ item, isSelectionMode, onSelect }: { item: LibraryItem; isSelectionMode?: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="v2-text-item" data-expanded={expanded ? '' : undefined} data-pick={isSelectionMode ? '' : undefined}>
      <button type="button" className="v2-text-item__body m3-focus-ring" onClick={() => (isSelectionMode ? onSelect() : setExpanded((e) => !e))}>
        <Ripple />
        <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
          {(item.title || isSelectionMode) && (
            <span className="flex items-center justify-between gap-2">
              {item.title && (
                <Text as="span" variant="label-small" emphasized className="uppercase tracking-widest text-primary">
                  {item.title}
                </Text>
              )}
              {isSelectionMode && (
                <Text as="span" variant="label-small" className="v2-text-item__hint">
                  {t('projectViewer.libraryPreview.pickThisText')}
                </Text>
              )}
            </span>
          )}
          <Text as="span" variant="body-medium" className={expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}>
            {item.content}
          </Text>
        </span>
      </button>
      {!isSelectionMode && <IconButton icon={expanded ? 'expand_less' : 'expand_more'} size="xs" label={t('v2.common.more')} onClick={() => setExpanded((e) => !e)} />}
    </div>
  );
}
