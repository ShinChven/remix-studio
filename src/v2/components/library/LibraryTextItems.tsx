import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, IconButton, Text } from '../../../m3';
import type { LibraryItem } from '../../../types';
import { ActionMenu, type ActionMenuItem } from '../../ui/ActionMenu';
import { TagLine } from '../../ui/ResultFilters';
import { shortDate } from '../project/JobRow';

export type TextView = 'cards' | 'list';

export interface LibraryTextItemsProps {
  view: TextView;
  items: LibraryItem[];
  selectedIds: Set<string>;
  /** Number of the first item on this page, for the list's index column. */
  firstIndex: number;
  menuItems: (item: LibraryItem) => ActionMenuItem[];
  editHref: (item: LibraryItem) => string;
  onOpen: (item: LibraryItem) => void;
  onToggle: (item: LibraryItem, index: number, shift: boolean) => void;
  onCopy: (item: LibraryItem) => void;
  onTagClick: (tag: string) => void;
}

/** Text items as cards that show the start of each text, or as one-line rows. */
export function LibraryTextItems({ view, items, selectedIds, firstIndex, menuItems, editHref, onOpen, onToggle, onCopy, onTagClick }: LibraryTextItemsProps) {
  const { t } = useTranslation();
  const selecting = selectedIds.size > 0;

  const open = (item: LibraryItem, index: number, e: MouseEvent) => {
    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onToggle(item, index, e.shiftKey);
    else onOpen(item);
  };
  const selectBox = (item: LibraryItem, index: number, className: string) => (
    <span
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(item, index, e.shiftKey);
      }}
    >
      <Checkbox checked={selectedIds.has(item.id)} onChange={() => undefined} tabIndex={-1} aria-label={t('libraryEditor.selectItem')} />
    </span>
  );
  const tools = (item: LibraryItem) => (
    <>
      <IconButton icon="content_copy" size="xs" label={t('libraryEditor.copyContent')} tooltip onClick={() => onCopy(item)} />
      <IconButton icon="edit_note" size="xs" label={t('libraryEditor.refineInFullEditor')} tooltip href={editHref(item)} />
      <ActionMenu label={t('v2.project.moreActions')} items={menuItems(item)} size="xs" />
    </>
  );

  if (view === 'list') {
    return (
      <div className="v2-joblist v2-lib-lines" data-selecting={selecting ? '' : undefined}>
        {items.map((item, index) => (
          <div key={item.id} id={`library-item-${item.id}`} className="v2-line" data-selected={selectedIds.has(item.id) ? '' : undefined}>
            {selectBox(item, index, 'v2-line__check')}
            <span className="v2-line__index">{String(firstIndex + index).padStart(2, '0')}</span>
            <button type="button" className="v2-line__main m3-focus-ring" onClick={(e) => open(item, index, e)}>
              <Text as="span" variant="body-medium" className="v2-line__title">
                {item.title || item.content}
              </Text>
              <Text as="span" variant="body-small" className="v2-line__meta">
                {[item.title ? item.content : null, shortDate(item.updatedAt || item.createdAt)].filter(Boolean).join(' · ')}
              </Text>
            </button>
            <span className="v2-line__tags">
              <TagLine tags={item.tags} onTagClick={onTagClick} limit={3} />
            </span>
            <span className="v2-line__actions">{tools(item)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="v2-notes" data-selecting={selecting ? '' : undefined}>
      {items.map((item, index) => {
        const selected = selectedIds.has(item.id);
        const date = shortDate(item.updatedAt || item.createdAt);
        return (
          <article key={item.id} id={`library-item-${item.id}`} className="v2-note" data-selected={selected ? '' : undefined}>
            <button type="button" className="v2-note__open m3-focus-ring" onClick={(e) => open(item, index, e)}>
              {item.title && <span className="v2-note__title">{item.title}</span>}
              <span className="v2-note__text" data-lead={item.title ? undefined : ''}>
                {item.content}
              </span>
            </button>
            <div className="v2-note__tools">{tools(item)}</div>
            <div className="v2-note__foot">
              {selectBox(item, index, 'v2-note__check')}
              <TagLine tags={item.tags} onTagClick={onTagClick} limit={4} />
              {date && <span className="v2-note__date">{date}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
