import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, IconButton, TextField } from '../../m3';

/** How long typing has to rest before a list is searched. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface ListSearchProps {
  /** The applied search. */
  value: string;
  /** Called once typing settles, and at once when the field is cleared or Enter is pressed. */
  onChange: (value: string) => void;
  /** Names the field, e.g. "Search projects". Also its tooltip. */
  label: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * The search of a list. It filters as you type: it waits for typing (and IME composition) to
 * settle, Enter applies at once and the clear button resets. Where its bar runs out of room it
 * folds into an icon that opens the field on a row of its own and closes once focus leaves.
 */
export function ListSearch({ value, onChange, label, placeholder, className, autoFocus }: ListSearchProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (expanded) wrapRef.current?.querySelector('input')?.focus();
  }, [expanded]);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const next = draft.trim();
    if (composing || next === value) return;
    const timer = window.setTimeout(() => onChangeRef.current(next), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, value, composing]);

  return (
    <span
      ref={wrapRef}
      className="v2-list-search-wrap"
      data-expanded={expanded ? '' : undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <IconButton icon="search" size="sm" variant={value ? 'tonal' : 'standard'} className="v2-list-search__toggle" label={label} tooltip onClick={() => setExpanded(true)} />
      <TextField
        variant="outlined"
        type="search"
        leadingIcon="search"
        value={draft}
        onValueChange={setDraft}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || composing) return;
          event.preventDefault();
          if (draft.trim() !== value) onChange(draft.trim());
        }}
        onClear={
          draft
            ? () => {
                setDraft('');
                if (value) onChange('');
              }
            : undefined
        }
        placeholder={placeholder ?? t('v2.common.search')}
        aria-label={label}
        title={label}
        autoFocus={autoFocus}
        className={cx('v2-search-field v2-search-field--pill v2-list-search', className)}
      />
    </span>
  );
}
