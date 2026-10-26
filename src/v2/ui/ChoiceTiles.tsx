import type { ReactNode } from 'react';
import { cx, Icon, Ripple, Text } from '../../m3';

export interface ChoiceTile<V extends string> {
  value: V;
  label: ReactNode;
  icon?: string;
  supportingText?: ReactNode;
  /** Utility classes for the selected tile (container + on-container roles). */
  tone?: string;
  disabled?: boolean;
}

export interface ChoiceTilesProps<V extends string> {
  options: ChoiceTile<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Grid columns on wide windows; tiles always wrap on narrow ones. */
  columns?: 1 | 2 | 3 | 4;
  size?: 'default' | 'compact';
  'aria-label'?: string;
  className?: string;
}

/** A single-choice group drawn as large selectable tiles (a radio group with icons). */
export function ChoiceTiles<V extends string>({ options, value, onChange, columns = 2, size = 'default', className, ...rest }: ChoiceTilesProps<V>) {
  return (
    <div role="radiogroup" aria-label={rest['aria-label']} className={cx('v2-choice-tiles', className)} data-columns={columns} data-size={size}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            className={cx('v2-choice-tile m3-focus-ring', selected && (option.tone ?? 'bg-secondary-container text-on-secondary-container'))}
            data-selected={selected ? '' : undefined}
            onClick={() => onChange(option.value)}
          >
            <Ripple disabled={option.disabled} />
            {option.icon && <Icon name={option.icon} filled={selected} />}
            <span className="flex min-w-0 flex-col items-start gap-0.5 text-start">
              <Text as="span" variant="label-large" emphasized={selected}>
                {option.label}
              </Text>
              {option.supportingText && (
                <Text as="span" variant="body-small" className="opacity-80">
                  {option.supportingText}
                </Text>
              )}
            </span>
            {selected && <Icon name="check_circle" filled className="v2-choice-tile__check" size={20} />}
          </button>
        );
      })}
    </div>
  );
}
