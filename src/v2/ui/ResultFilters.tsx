import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, TextField } from '../../m3';

/**
 * Search that waits for typing (and IME composition) to settle before filtering. In a narrow
 * pane it folds into an icon that opens the field on a row of its own and closes once focus leaves.
 */
export function ResultsSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (expanded) wrapRef.current?.querySelector('input')?.focus();
  }, [expanded]);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (composing || draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value, onChange, composing]);
  return (
    <span
      ref={wrapRef}
      className="v2-album-search-wrap"
      data-expanded={expanded ? '' : undefined}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <IconButton icon="search" size="sm" variant={value ? 'tonal' : 'standard'} className="v2-album-search__toggle" label={label} onClick={() => setExpanded(true)} />
      <TextField
        variant="outlined"
        type="search"
        leadingIcon="search"
        value={draft}
        onValueChange={setDraft}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onClear={
          draft
            ? () => {
                setDraft('');
                onChange('');
              }
            : undefined
        }
        placeholder={t('v2.common.search')}
        aria-label={label}
        title={label}
        className="v2-search-field v2-search-field--pill v2-album-search"
      />
    </span>
  );
}

/** Tags on an item, as quiet text; clicking one filters by it. */
export function TagLine({ tags, onTagClick, limit }: { tags?: string[]; onTagClick?: (tag: string) => void; limit?: number }) {
  if (!tags || tags.length === 0) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const overflow = tags.length - shown.length;
  return (
    <span className="v2-tag-line">
      {shown.map((tag) => (
        <button
          key={tag}
          type="button"
          className="v2-tag-line__tag"
          title={tag}
          disabled={!onTagClick}
          onClick={(e) => {
            e.stopPropagation();
            onTagClick?.(tag);
          }}
        >
          #{tag}
        </button>
      ))}
      {overflow > 0 && <span className="v2-tag-line__more">+{overflow}</span>}
    </span>
  );
}

/** One active filter, removable. */
export function FilterChip({ label, onRemove, removeLabel }: { label: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="v2-filter-chip">
      <span className="truncate">{label}</span>
      <button type="button" className="v2-filter-chip__remove m3-focus-ring" aria-label={removeLabel} onClick={onRemove}>
        <Icon name="close" size={14} />
      </button>
    </span>
  );
}
