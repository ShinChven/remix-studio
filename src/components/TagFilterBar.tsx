import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, X } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** One tag plus how many items carry it. */
export interface TagFacet {
  tag: string;
  count: number;
}

type TagSort = 'count' | 'name';

/**
 * Unselected tags kept in the resting row. Everything else stays one click
 * away in the panel — a library with hundreds of tags must not push the item
 * grid off screen.
 */
const RESTING_ROW_LIMIT = 24;
const PANEL_STORAGE_PREFIX = 'tag_filter_panel:';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readPanelOpen(scope?: string) {
  if (!scope || !canUseStorage()) return false;
  try {
    return window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}${scope}`) === 'open';
  } catch {
    return false;
  }
}

function writePanelOpen(scope: string | undefined, open: boolean) {
  if (!scope || !canUseStorage()) return;
  try {
    window.localStorage.setItem(`${PANEL_STORAGE_PREFIX}${scope}`, open ? 'open' : 'closed');
  } catch {
    // Remembering the panel state is best effort.
  }
}

/**
 * Count every tag across a set of items. Tags differing only in case are one
 * facet, labelled with the first spelling seen.
 */
export function tagFacetsFromItems(items: { tags?: string[] }[]): TagFacet[] {
  const facets = new Map<string, TagFacet>();
  items.forEach(item => {
    item.tags?.forEach(tag => {
      const key = tag.toLowerCase();
      const existing = facets.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        facets.set(key, { tag, count: 1 });
      }
    });
  });
  return Array.from(facets.values());
}

function TagChip({
  tag,
  count,
  selected,
  onClick,
}: {
  tag: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tag}
      className={`shrink-0 inline-flex items-center gap-1.5 max-w-[60vw] md:max-w-80 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-semibold border transition-all ${
        selected
          ? 'bg-blue-600/20 text-blue-500 dark:text-blue-400 border-blue-500/50'
          : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
      }`}
    >
      <span className="block truncate">{tag}</span>
      {selected ? (
        <X className="w-3 h-3 shrink-0 opacity-70" />
      ) : (
        <span className="shrink-0 text-[10px] font-black tabular-nums opacity-50">{count}</span>
      )}
    </button>
  );
}

interface TagPanelBodyProps {
  query: string;
  onQueryChange: (value: string) => void;
  sort: TagSort;
  onSortChange: (sort: TagSort) => void;
  selectedFacets: TagFacet[];
  visibleFacets: TagFacet[];
  isSelected: (tag: string) => boolean;
  onToggle: (tag: string) => void;
  onClear: () => void;
  autoFocusSearch: boolean;
  listClassName: string;
}

/** Search box, sort switch, the pinned selection, and the full tag list. */
function TagPanelBody({
  query,
  onQueryChange,
  sort,
  onSortChange,
  selectedFacets,
  visibleFacets,
  isSelected,
  onToggle,
  onClear,
  autoFocusSearch,
  listClassName,
}: TagPanelBodyProps) {
  const { t } = useTranslation();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Typing then Enter is the fast path when a library has hundreds of tags.
    const first = visibleFacets.find(facet => !isSelected(facet.tag));
    if (!first) return;
    e.preventDefault();
    onToggle(first.tag);
    onQueryChange('');
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            autoFocus={autoFocusSearch}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t('tagFilter.searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-blue-500/40 transition-colors"
          />
        </div>
        <div className="inline-flex shrink-0 p-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
          {(['count', 'name'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onSortChange(mode)}
              className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${
                sort === mode
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {t(mode === 'count' ? 'tagFilter.sortByCount' : 'tagFilter.sortByName')}
            </button>
          ))}
        </div>
      </div>

      {selectedFacets.length > 0 && (
        <div className="flex items-start gap-2 pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <span className="shrink-0 pt-1.5 text-[9px] font-black uppercase tracking-widest text-neutral-500">
            {t('tagFilter.selected')}
          </span>
          <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
            {selectedFacets.map(facet => (
              <TagChip
                key={facet.tag}
                tag={facet.tag}
                count={facet.count}
                selected
                onClick={() => onToggle(facet.tag)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 pt-1.5 text-[9px] font-bold uppercase tracking-widest text-blue-500/70 hover:text-blue-500"
          >
            {t('tagFilter.clear')}
          </button>
        </div>
      )}

      <div className={listClassName}>
        {visibleFacets.length === 0 ? (
          <p className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {t('tagFilter.noMatches')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {visibleFacets.map(facet => (
              <TagChip
                key={facet.tag}
                tag={facet.tag}
                count={facet.count}
                selected={isSelected(facet.tag)}
                onClick={() => onToggle(facet.tag)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

interface TagFilterBarProps {
  /** Every tag in the source, with counts. Order does not matter. */
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
 * Tag filter that scales from three tags to several hundred: a single resting
 * row carrying the selection plus the most-used tags, and a searchable panel
 * (a bottom sheet on phones) holding the rest.
 */
export function TagFilterBar({
  tags,
  selected,
  onChange,
  matchMode = 'or',
  onMatchModeChange,
  storageKey,
  className = '',
}: TagFilterBarProps) {
  const { t, i18n } = useTranslation();
  const isCompact = useMediaQuery('(max-width: 767px)');
  const [isOpen, setIsOpen] = useState(() => readPanelOpen(storageKey));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TagSort>('count');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [hasMoreToScroll, setHasMoreToScroll] = useState(false);

  useEffect(() => {
    setIsOpen(readPanelOpen(storageKey));
    setQuery('');
  }, [storageKey]);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    writePanelOpen(storageKey, open);
    if (!open) setQuery('');
  }, [storageKey]);

  const selectedKeys = useMemo(
    () => new Set(selected.map(tag => tag.toLowerCase())),
    [selected]
  );
  const isSelected = useCallback((tag: string) => selectedKeys.has(tag.toLowerCase()), [selectedKeys]);

  const toggle = useCallback((tag: string) => {
    const key = tag.toLowerCase();
    onChange(
      selectedKeys.has(key)
        ? selected.filter(item => item.toLowerCase() !== key)
        : [...selected, tag]
    );
  }, [onChange, selected, selectedKeys]);

  const clear = useCallback(() => onChange([]), [onChange]);

  const collator = useMemo(
    () => new Intl.Collator(i18n.language || undefined, { sensitivity: 'base', numeric: true }),
    [i18n.language]
  );

  const facetsByName = useMemo(
    () => [...tags].sort((a, b) => collator.compare(a.tag, b.tag)),
    [tags, collator]
  );
  const facetsByCount = useMemo(
    () => [...facetsByName].sort((a, b) => b.count - a.count),
    [facetsByName]
  );
  const sortedFacets = sort === 'name' ? facetsByName : facetsByCount;

  /** Selected tags stay listed even if nothing carries them any more. */
  const selectedFacets = useMemo(() => {
    const known = new Map(tags.map(facet => [facet.tag.toLowerCase(), facet]));
    return selected.map(tag => known.get(tag.toLowerCase()) ?? { tag, count: 0 });
  }, [selected, tags]);

  // The row is a shortcut, not a listing: it always offers the most-used tags,
  // whichever order the panel happens to be sorted in.
  const restingFacets = useMemo(() => {
    const unselected = facetsByCount
      .filter(facet => !isSelected(facet.tag))
      .slice(0, RESTING_ROW_LIMIT);
    return [...selectedFacets, ...unselected];
  }, [facetsByCount, selectedFacets, isSelected]);

  const visibleFacets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedFacets;
    return sortedFacets.filter(facet => facet.tag.toLowerCase().includes(q));
  }, [sortedFacets, query]);

  // Fade the row's trailing edge only while there is something left to scroll to.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setHasMoreToScroll(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [restingFacets.length]);

  // Escape closes the panel before it reaches whatever modal hosts this bar.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, setOpen]);

  if (tags.length === 0 && selected.length === 0) return null;

  const panelBody = (
    <TagPanelBody
      query={query}
      onQueryChange={setQuery}
      sort={sort}
      onSortChange={setSort}
      selectedFacets={selectedFacets}
      visibleFacets={visibleFacets}
      isSelected={isSelected}
      onToggle={toggle}
      onClear={clear}
      autoFocusSearch={!isCompact}
      listClassName={isCompact ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : 'max-h-[40vh] overflow-y-auto custom-scrollbar'}
    />
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <div
            ref={scrollerRef}
            className="flex gap-1.5 overflow-x-auto scrollbar-hide"
          >
            <button
              type="button"
              onClick={clear}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                selected.length === 0
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
              }`}
            >
              {t('tagFilter.allItems')}
            </button>
            {restingFacets.map(facet => (
              <TagChip
                key={facet.tag}
                tag={facet.tag}
                count={facet.count}
                selected={isSelected(facet.tag)}
                onClick={() => toggle(facet.tag)}
              />
            ))}
          </div>
          {hasMoreToScroll && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white dark:from-neutral-900 to-transparent" />
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
            isOpen
              ? 'bg-blue-600/20 text-blue-500 dark:text-blue-400 border-blue-500/50'
              : 'bg-neutral-50 dark:bg-neutral-950 text-neutral-500 dark:text-neutral-500 border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'
          }`}
        >
          {t('tagFilter.allTags', { count: tags.length })}
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen && !isCompact ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {onMatchModeChange && selected.length >= 2 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-500">
            {t('tagFilter.matchMode')}
          </span>
          <div className="inline-flex p-0.5 rounded-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
            {(['or', 'and'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => onMatchModeChange(mode)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                  matchMode === mode
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
                }`}
              >
                {t(mode === 'and' ? 'tagFilter.matchAll' : 'tagFilter.matchAny')}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && !isCompact && (
        <div className="space-y-2 p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40 animate-in fade-in slide-in-from-top-1 duration-200">
          {panelBody}
        </div>
      )}

      {isOpen && isCompact && createPortal(
        <div className="fixed inset-0 z-[700] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <div className="relative h-[75dvh] flex flex-col bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="pt-2 pb-1 flex justify-center">
              <div className="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            </div>
            <div className="px-4 pb-3 flex flex-col gap-2 flex-1 min-h-0">
              {panelBody}
              {onMatchModeChange && selected.length >= 2 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                    {t('tagFilter.matchMode')}
                  </span>
                  <div className="inline-flex p-0.5 rounded-full bg-neutral-100 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
                    {(['or', 'and'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onMatchModeChange(mode)}
                        className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                          matchMode === mode
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-neutral-500 dark:text-neutral-500'
                        }`}
                      >
                        {t(mode === 'and' ? 'tagFilter.matchAll' : 'tagFilter.matchAny')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50/50 dark:bg-neutral-950/50">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                {t('tagFilter.selectedCount', { count: selected.length })}
              </span>
              <div className="flex items-center gap-2">
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={clear}
                    className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800"
                  >
                    {t('tagFilter.clear')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white"
                >
                  {t('tagFilter.done')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
