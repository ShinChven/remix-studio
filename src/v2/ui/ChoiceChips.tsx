import type { ReactNode } from 'react';
import { cx, Ripple } from '../../m3';

export interface ChoiceChipOption<V extends string | number> {
  value: V;
  label?: ReactNode;
  /** Small visual above the label, e.g. an aspect-ratio glyph. */
  visual?: ReactNode;
  disabled?: boolean;
}

/** Compact single-choice group that wraps: for settings with many short values. */
export function ChoiceChips<V extends string | number>({ options, value, onChange, className, 'aria-label': ariaLabel, stacked }: { options: ChoiceChipOption<V>[]; value: V; onChange: (value: V) => void; className?: string; 'aria-label'?: string; stacked?: boolean }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('v2-choice-chips', className)} data-stacked={stacked ? '' : undefined}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button key={String(option.value)} type="button" role="radio" aria-checked={selected} disabled={option.disabled} data-selected={selected ? '' : undefined} className="v2-choice-chip m3-focus-ring" onClick={() => onChange(option.value)}>
            <Ripple disabled={option.disabled} />
            {option.visual}
            <span className="v2-choice-chip__label">{option.label ?? String(option.value)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A labelled settings field. */
export function SettingField({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="v2-setting">
      <div className="v2-setting__label">{label}</div>
      {children}
      {hint && <div className="v2-setting__hint">{hint}</div>}
    </div>
  );
}

/** A tiny rectangle with the proportions of an aspect ratio such as `16:9` or `1024x1024`. */
export function RatioGlyph({ ratio }: { ratio: string }) {
  const parts = ratio.includes(':') ? ratio.split(':') : ratio.split('x');
  const [w, h] = parts.map(Number);
  let width = 14;
  let height = 14;
  if (w && h && w !== h) {
    if (w > h) {
      width = 22;
      height = Math.max(6, 22 * (h / w));
    } else {
      height = 22;
      width = Math.max(6, 22 * (w / h));
    }
  }
  return (
    <span className="v2-ratio-glyph" aria-hidden>
      <span style={{ width, height }} />
    </span>
  );
}
