import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, ChipSet, FilterChip, Text, TextField, useWindowSizeClass } from '../../m3';
import { Segmented } from './Toolbar';

/** One tag plus how many items carry it. */
export interface TagFacet {
  tag: string;
  count: number;
}

type TagSort = 'count' | 'name';

/** Unselected tags kept in the resting row; the rest stay one click away in the panel. */
const RESTING_ROW_LIMIT = 24;
const PANEL_STORAGE_PREFIX = 'tag_filter_panel:';

function readPanelOpen(scope?: string) {
  if (!scope) return false;
  try {
    return window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}${scope}`) === 'open';
  } catch {
    return false;
  }
}

function writePanelOpen(scope: string | undefined, open: boolean) {
  if (!scope) return;
  try {
    window.localStorage.setItem(`${PANEL_STORAGE_PREFIX}${scope}`, open ? 'open' : 'closed');
  } catch {
    // Remembering the panel state is best effort.
  }
}

/** Counts every tag across items; tags differing only in case are one facet, labelled by the first spelling. */
export function tagFacetsFromItems(items: { tags?: string[] }[]): TagFacet[] {
  const facets = new Map<string, TagFacet>();
  items.forEach((item) =>
    item.tags?.forEach((tag) => {
      const key = tag.toLowerCase();
      const existing = facets.get(key);
      if (existing) existing.count += 1;
      else facets.set(key, { tag, count: 1 });
    }),
  );
  return [...facets.values()];
}

export interface TagFilterProps {
  /** Every tag in the source, with counts. */
  tags: TagFacet[];
  selected: string[];
  onChange: (next: string[]) => void;
  matchMode?: 'and' | 'or';
  onMatchModeChange?: (mode: 'and' | 'or') => void;
  /** Scopes the remembered panel state, e.g. `library-preview:<id>`. */
  storageKey?: string;
  className?: string;
}

/**
 * Tag filter that scales from three tags to hundreds: a resting row with the
 * selection and the most-used tags, plus a searchable panel (a bottom sheet on
 * phones) holding the rest.
 */
export function TagFilter({ tags, selected, onChange, matchMode = 'or', onMatchModeChange, storageKey, className }: TagFilterProps) {
  const { t, i18n } = useTranslation();
  const compact = useWindowSizeClass() === 'compact';
  const [open, setOpenState] = useState(() => readPanelOpen(storageKey));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TagSort>('count');

  useEffect(() => {
    setOpenState(readPanelOpen(storageKey));
    setQuery('');
  }, [storageKey]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      writePanelOpen(storageKey, next);
      if (!next) setQuery('');
    },
    [storageKey],
  );

  const selectedKeys = useMemo(() => new Set(selected.map((tag) => tag.toLowerCase())), [selected]);
  const isSelected = useCallback((tag: string) => selectedKeys.has(tag.toLowerCase()), [selectedKeys]);
  const toggle = useCallback(
    (tag: string) => {
      const key = tag.toLowerCase();
      onChange(selectedKeys.has(key) ? selected.filter((item) => item.toLowerCase() !== key) : [...selected, tag]);
    },
    [onChange, selected, selectedKeys],
  );
  const clear = useCallback(() => onChange([]), [onChange]);

  const collator = useMemo(() => new Intl.Collator(i18n.language || undefined, { sensitivity: 'base', numeric: true }), [i18n.language]);
  const byName = useMemo(() => [...tags].sort((a, b) => collator.compare(a.tag, b.tag)), [tags, collator]);
  const byCount = useMemo(() => [...byName].sort((a, b) => b.count - a.count), [byName]);
  const sorted = sort === 'name' ? byName : byCount;

  /** Selected tags stay listed even if nothing carries them any more. */
  const selectedFacets = useMemo(() => {
    const known = new Map(tags.map((facet) => [facet.tag.toLowerCase(), facet]));
    return selected.map((tag) => known.get(tag.toLowerCase()) ?? { tag, count: 0 });
  }, [selected, tags]);
  const resting = useMemo(() => [...selectedFacets, ...byCount.filter((f) => !isSelected(f.tag)).slice(0, RESTING_ROW_LIMIT)], [byCount, selectedFacets, isSelected]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((f) => f.tag.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);

  if (tags.length === 0 && selected.length === 0) return null;

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Typing then Enter is the fast path when a source has hundreds of tags.
    const first = visible.find((f) => !isSelected(f.tag));
    if (!first) return;
    e.preventDefault();
    toggle(first.tag);
    setQuery('');
  };

  const matchControl = onMatchModeChange && selected.length >= 2 && (
    <div className="flex items-center gap-2">
      <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
        {t('tagFilter.matchMode')}
      </Text>
      <Segmented<'or' | 'and'>
        value={matchMode}
        onChange={onMatchModeChange}
        options={[
          { value: 'or', label: t('tagFilter.matchAny') },
          { value: 'and', label: t('tagFilter.matchAll') },
        ]}
      />
    </div>
  );

  const panel = (
    <div className="v2-tag-panel">
      <div className="flex items-center gap-2">
        <TextField variant="outlined" leadingIcon="search" value={query} onValueChange={setQuery} onKeyDown={onSearchKey} placeholder={t('tagFilter.searchPlaceholder')} aria-label={t('tagFilter.searchPlaceholder')} className="v2-tag-panel__search" autoFocus={!compact} />
        <Segmented<TagSort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'count', label: t('tagFilter.sortByCount') },
            { value: 'name', label: t('tagFilter.sortByName') },
          ]}
        />
      </div>
      {selectedFacets.length > 0 && (
        <div className="v2-tag-panel__selected">
          <Text as="span" variant="label-small" className="pt-2 uppercase tracking-widest text-on-surface-variant">
            {t('tagFilter.selected')}
          </Text>
          <ChipSet className="min-w-0 flex-1">
            {selectedFacets.map((f) => (
              <FilterChip key={f.tag} label={f.tag} selected onClick={() => toggle(f.tag)} />
            ))}
          </ChipSet>
          <Button variant="text" size="xs" onClick={clear}>
            {t('tagFilter.clear')}
          </Button>
        </div>
      )}
      <div className="v2-tag-panel__list">
        {visible.length === 0 ? (
          <Text variant="label-medium" className="py-6 text-center text-on-surface-variant">
            {t('tagFilter.noMatches')}
          </Text>
        ) : (
          <ChipSet>
            {visible.map((f) => (
              <FilterChip key={f.tag} label={<TagLabel tag={f.tag} count={f.count} />} selected={isSelected(f.tag)} onClick={() => toggle(f.tag)} />
            ))}
          </ChipSet>
        )}
      </div>
    </div>
  );

  return (
    <div className={className} data-density="compact">
      <div className="v2-tag-filter">
        <ChipSet scroll className="v2-tag-filter__row">
          <FilterChip label={t('tagFilter.allItems')} selected={selected.length === 0} onClick={clear} />
          {resting.map((f) => (
            <FilterChip key={f.tag} label={<TagLabel tag={f.tag} count={isSelected(f.tag) ? undefined : f.count} />} selected={isSelected(f.tag)} onClick={() => toggle(f.tag)} />
          ))}
        </ChipSet>
        <Button variant={open ? 'tonal' : 'outlined'} size="xs" trailingIcon={open && !compact ? 'expand_less' : 'expand_more'} onClick={() => setOpen(!open)}>
          {t('tagFilter.allTags', { count: tags.length })}
        </Button>
      </div>
      {!(open && compact) && matchControl && <div className="mt-2">{matchControl}</div>}
      {open && !compact && <div className="mt-2">{panel}</div>}
      <BottomSheet open={open && compact} onClose={() => setOpen(false)} aria-label={t('tagFilter.allTags', { count: tags.length })}>
        <div className="flex flex-col gap-3 px-4 pb-4" data-density="compact">
          {panel}
          {matchControl}
          <div className="flex items-center justify-between gap-3">
            <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {t('tagFilter.selectedCount', { count: selected.length })}
            </Text>
            <div className="flex gap-2">
              {selected.length > 0 && (
                <Button variant="outlined" size="sm" onClick={clear}>
                  {t('tagFilter.clear')}
                </Button>
              )}
              <Button variant="filled" size="sm" onClick={() => setOpen(false)}>
                {t('tagFilter.done')}
              </Button>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

function TagLabel({ tag, count }: { tag: string; count?: number }) {
  return (
    <span className="v2-tag-label" title={tag}>
      <span className="truncate">{tag}</span>
      {count !== undefined && <span className="v2-tag-label__count">{count}</span>}
    </span>
  );
}
