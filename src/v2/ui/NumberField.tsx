import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx, IconButton, TextField, type FieldVariant } from '../../m3';

function clamp(value: number, min?: number, max?: number) {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

export interface NumberFieldProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Round committed values to whole numbers. */
  integer?: boolean;
  label?: ReactNode;
  supportingText?: ReactNode;
  suffixText?: ReactNode;
  /** Adds − / + buttons around the value. */
  stepper?: boolean;
  variant?: FieldVariant;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  leadingIcon?: string;
  'aria-label'?: string;
}

/**
 * Number field that can be cleared while typing. It keeps an editable draft, commits only values
 * inside [min, max], and on blur restores an empty field or clamps an out-of-range one.
 */
export function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  integer = false,
  label,
  supportingText,
  suffixText,
  stepper,
  variant = 'outlined',
  disabled,
  fullWidth,
  className,
  leadingIcon,
  ...rest
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string, final: boolean) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      if (final) setDraft(String(value));
      return;
    }
    if (!final && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max))) return;
    const next = clamp(integer ? Math.round(parsed) : parsed, min, max);
    if (final) setDraft(String(next));
    if (next !== value) onValueChange(next);
  };

  const nudge = (direction: 1 | -1) => {
    const base = Number.isFinite(Number(draft)) ? Number(draft) : value;
    const next = clamp(Number((base + direction * step).toFixed(6)), min, max);
    setDraft(String(next));
    if (next !== value) onValueChange(next);
  };

  return (
    <TextField
      variant={variant}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      label={label}
      aria-label={rest['aria-label']}
      supportingText={supportingText}
      suffixText={suffixText}
      leadingIcon={
        stepper ? <IconButton icon="remove" label="−" size="xs" disabled={disabled || (min !== undefined && value <= min)} onClick={() => nudge(-1)} /> : leadingIcon
      }
      trailingIcon={stepper ? <IconButton icon="add" label="+" size="xs" disabled={disabled || (max !== undefined && value >= max)} onClick={() => nudge(1)} /> : undefined}
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      fullWidth={fullWidth}
      className={cx('v2-number-field', stepper && 'v2-number-field--stepper', className)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value, true);
      }}
      onValueChange={(raw) => {
        setDraft(raw);
        commit(raw, false);
      }}
    />
  );
}
