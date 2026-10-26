import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useM3Locale } from '../i18n/locale'
import { cx, useControllableState, useMediaQuery, useStableId } from '../utils/hooks'
import { useLayer } from '../utils/layers'
import { IconButton } from './Button'
import { Icon, type IconSource, renderIcon } from './Icon'
import { LinearProgress } from './Progress'

export interface SearchSuggestion {
  /** Text written to the input when the suggestion is chosen. Unique within the list. */
  value: string
  /** Main text of the suggestion. */
  label: ReactNode
  /** Leading icon. Defaults to `history`. */
  icon?: IconSource
  /** Second line of text under the label. */
  supportingText?: ReactNode
  /** Keeps the view open after choosing it, e.g. a suggestion that completes the query. */
  keepOpen?: boolean
}

/** A group of suggestions, separated from the others by a gap (M3 Expressive). */
export interface SearchSuggestionGroup {
  /** Heading of the group, e.g. “Recent” or “Contacts”. It also names the group. */
  label?: ReactNode
  /** The suggestions in the group. */
  suggestions: SearchSuggestion[]
}

export interface SearchProps {
  /** Query text (controlled). */
  value?: string
  /** Initial query text (uncontrolled). */
  defaultValue?: string
  /** Called with the new query text: typed, cleared or set by a chosen suggestion. */
  onChange?: (value: string) => void
  /** Enter pressed with no suggestion highlighted. */
  onSubmit?: (value: string) => void
  /** Shown in the search view while the bar is active. Pass [] to show the empty state. */
  suggestions?: SearchSuggestion[]
  /** Suggestions in groups separated by gaps, instead of one list. */
  groups?: SearchSuggestionGroup[]
  /** Called when a suggestion is chosen with a click or with Enter. */
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void
  /** Hint text in the empty bar. It is also the accessible name when `aria-label` is not set. */
  placeholder?: string
  /** Leading content when inactive (defaults to a search icon). */
  leading?: ReactNode
  /** Trailing content when inactive: avatar, mic… */
  trailing?: ReactNode
  /** Shows a progress bar under the input while suggestions load. */
  loading?: boolean
  /** Message shown when `suggestions` is empty. */
  emptyText?: ReactNode
  /** `true` always opens a full-screen view; `'compact'` (default) only on compact windows. */
  fullScreen?: boolean | 'compact'
  /** Extra class on the root element. */
  className?: string
  /** Accessible name of the input and of the suggestion list. */
  'aria-label'?: string
  /** Focuses the search input on pressing Cmd+K (macOS) or Ctrl+K. Also renders a shortcut badge if trailing is unset. */
  shortcut?: boolean
}

/**
 * Search (M3 Expressive, contained style): a search bar that grows wider when focused and opens
 * a docked (or full-screen) view of suggestions, optionally in groups.
 */
export function Search({
  value: valueProp,
  defaultValue = '',
  onChange,
  onSubmit,
  suggestions: suggestionsProp,
  groups,
  onSuggestionSelect,
  placeholder,
  leading,
  trailing,
  loading,
  emptyText,
  fullScreen = 'compact',
  className,
  'aria-label': ariaLabel,
  shortcut,
}: SearchProps) {
  const { messages } = useM3Locale()
  const suggestions = groups ? groups.flatMap((group) => group.suggestions) : suggestionsProp
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onChange })
  const [active, setActive] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useStableId('m3-search-list')
  const compact = useMediaQuery('(max-width: 599.98px)')
  const isFullScreen = active && (fullScreen === true || (fullScreen === 'compact' && compact))
  const showView = active && suggestions !== undefined
  const hasList = showView && suggestions.length > 0
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)

  useEffect(() => {
    if (!shortcut) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null
        if (target === inputRef.current) return
        e.preventDefault()
        inputRef.current?.focus()
        setActive(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut])

  useLayer(active, {
    onEscape: () => close(),
    onOutsidePointerDown: () => setActive(false),
    refs: [rootRef],
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: new suggestions reset the highlight
  useEffect(() => setHighlight(-1), [suggestionsProp, groups])

  function close() {
    setActive(false)
    setHighlight(-1)
    inputRef.current?.blur()
  }

  const select = (suggestion: SearchSuggestion) => {
    setValue(suggestion.value)
    onSuggestionSelect?.(suggestion)
    if (suggestion.keepOpen) {
      setHighlight(-1)
      inputRef.current?.focus()
      return
    }
    close()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions?.length ?? 0
    if (e.key === 'ArrowDown' && count) {
      e.preventDefault()
      setActive(true)
      setHighlight((h) => (h + 1) % count)
    } else if (e.key === 'ArrowUp' && count) {
      e.preventDefault()
      setHighlight((h) => (h <= 0 ? count - 1 : h - 1))
    } else if (e.key === 'Enter' && highlight >= 0 && suggestions?.[highlight]) {
      e.preventDefault()
      select(suggestions[highlight])
    }
  }

  const renderOption = (s: SearchSuggestion, i: number) => (
    <div
      key={s.value}
      id={`${listId}-${i}`}
      role="option"
      aria-selected={i === highlight}
      className="m3-search__option"
      data-active={i === highlight ? '' : undefined}
      onPointerMove={() => setHighlight(i)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => select(s)}
    >
      <span className="m3-search__option-icon">{renderIcon(s.icon ?? 'history')}</span>
      <span className="m3-search__option-text">
        <span>{s.label}</span>
        {s.supportingText && (
          <span className="m3-search__option-supporting">{s.supportingText}</span>
        )}
      </span>
    </div>
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit?.(value)
    close()
  }

  return (
    <div
      ref={rootRef}
      className={cx('m3-search', className)}
      data-active={active ? '' : undefined}
      data-view={showView ? '' : undefined}
      data-fullscreen={isFullScreen ? '' : undefined}
    >
      <form role="search" className="m3-search__bar" onSubmit={handleSubmit}>
        <span className="m3-search__leading">
          {active ? (
            <IconButton
              icon="arrow_back"
              label={messages.back}
              onClick={close}
              className="m3-mirror-rtl"
            />
          ) : (
            (leading ?? <Icon name="search" />)
          )}
        </span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label={ariaLabel ?? placeholder ?? messages.search}
          aria-autocomplete="list"
          aria-expanded={hasList}
          aria-controls={hasList ? listId : undefined}
          aria-activedescendant={hasList && highlight >= 0 ? `${listId}-${highlight}` : undefined}
          className="m3-search__input"
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => {
            setValue(e.target.value)
            setActive(true)
          }}
          onFocus={() => setActive(true)}
          onKeyDown={onKeyDown}
        />
        <span className="m3-search__trailing">
          {active && value ? (
            <IconButton
              icon="close"
              label={messages.clear}
              onClick={() => {
                setValue('')
                inputRef.current?.focus()
              }}
            />
          ) : !active ? (
            trailing !== undefined ? (
              trailing
            ) : shortcut ? (
              <kbd className="m3-search__shortcut">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
            ) : null
          ) : null}
        </span>
      </form>
      {showView && (
        <div className="m3-search__view">
          {loading && (
            <LinearProgress aria-label={messages.loading} className="m3-search__progress" />
          )}
          {suggestions.length === 0 ? (
            // While loading, the progress bar says enough: "No results" would be premature.
            !loading && <div className="m3-search__empty">{emptyText ?? messages.noResults}</div>
          ) : (
            <div
              id={listId}
              role="listbox"
              className="m3-search__list"
              aria-label={ariaLabel ?? messages.search}
            >
              {groups
                ? groups.map((group, g) => {
                    const offset = groups
                      .slice(0, g)
                      .reduce((sum, previous) => sum + previous.suggestions.length, 0)
                    return (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: groups have no stable id
                        key={g}
                        role="group"
                        aria-labelledby={group.label ? `${listId}-group-${g}` : undefined}
                        className="m3-search__group"
                      >
                        {group.label && (
                          <div
                            id={`${listId}-group-${g}`}
                            role="presentation"
                            className="m3-search__group-label"
                          >
                            {group.label}
                          </div>
                        )}
                        {group.suggestions.map((s, i) => renderOption(s, offset + i))}
                      </div>
                    )
                  })
                : suggestions.map((s, i) => renderOption(s, i))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
