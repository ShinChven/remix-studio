import { useEffect, useRef, type ReactNode } from 'react';
import { cx, LinearProgress, Portal, renderIcon, Ripple, useAnchorPosition, type AnchorLike, type Placement } from '../../m3';

export interface SuggestionOption {
  key: string;
  label: ReactNode;
  supportingText?: ReactNode;
  icon?: ReactNode | string;
  trailing?: ReactNode;
}

export interface SuggestionListProps {
  open: boolean;
  anchor: AnchorLike | null | undefined;
  options: SuggestionOption[];
  activeIndex: number;
  onActiveIndexChange?: (index: number) => void;
  onSelect: (index: number) => void;
  /** Heading row: what is being picked, or that a search is running. */
  heading?: ReactNode;
  /** Shown when there are no options. */
  emptyText?: ReactNode;
  /** Small print under the heading. */
  hint?: ReactNode;
  loading?: boolean;
  placement?: Placement;
  width?: number;
  'aria-label'?: string;
}

/**
 * A listbox of suggestions positioned next to a text input that keeps focus, for `@` mentions,
 * `/` commands and autocomplete. The input drives the highlight with the arrow keys.
 */
export function SuggestionList({
  open,
  anchor,
  options,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  heading,
  emptyText,
  hint,
  loading,
  placement = 'top-start',
  width = 320,
  ...rest
}: SuggestionListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { style, placement: resolved } = useAnchorPosition({ anchor, floatingRef: ref, open, placement, fitHeight: true, offset: 8 });

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role="listbox"
        aria-label={rest['aria-label']}
        className="m3-menu v2-suggestions"
        data-state="open"
        data-placement={resolved}
        style={{ ...style, width, maxWidth: 'calc(100vw - 16px)', maxHeight: 320 }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {loading && <LinearProgress aria-label="Loading" className="v2-suggestions__progress" />}
        {heading && <div className="m3-menu-group__label">{heading}</div>}
        {hint && <div className="v2-suggestions__hint">{hint}</div>}
        {!loading && options.length === 0 && emptyText && <div className="v2-suggestions__empty">{emptyText}</div>}
        {options.map((option, index) => (
          <div
            key={option.key}
            role="option"
            aria-selected={index === activeIndex}
            data-index={index}
            className={cx('m3-menu-item')}
            data-active={index === activeIndex ? '' : undefined}
            onPointerMove={() => onActiveIndexChange?.(index)}
            onClick={() => onSelect(index)}
          >
            <Ripple />
            {option.icon !== undefined && <span className="m3-menu-item__icon">{typeof option.icon === 'string' ? renderIcon(option.icon) : option.icon}</span>}
            <span className="m3-menu-item__text">
              <span className="m3-menu-item__label">{option.label}</span>
              {option.supportingText && <span className="m3-menu-item__supporting">{option.supportingText}</span>}
            </span>
            {option.trailing}
          </div>
        ))}
      </div>
    </Portal>
  );
}
