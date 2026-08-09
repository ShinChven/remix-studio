import React, { useEffect, useRef, useState } from 'react';

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'min' | 'max' | 'step' | 'type'
>;

interface NumberInputProps extends NativeInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Round committed values to whole numbers. */
  integer?: boolean;
}

function clamp(value: number, min?: number, max?: number) {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}

/**
 * Number field that can be cleared while typing.
 *
 * A plain `value={someNumber}` input fights the user: clearing the box parses to
 * NaN (or 0), the parent re-renders with the old number, and the last digit
 * appears to be undeletable. This keeps an editable draft string instead, so the
 * field may be empty or mid-edit ("-", "1.") while focused, and only commits when
 * the text parses to a number inside [min, max]. Leaving the field empty or out
 * of range resolves on blur: empty restores the committed value, out of range
 * clamps to it.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step,
  integer = false,
  onBlur,
  onFocus,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  const focusedRef = useRef(false);

  // Follow the committed value unless the user is mid-edit, where overwriting
  // the draft is exactly the behaviour this component exists to avoid.
  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const next = clamp(integer ? Math.round(parsed) : parsed, min, max);
    if (next !== value) onValueChange(next);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    setDraft(raw);

    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    // Hold back values outside the range until blur so typing "12" into a field
    // with min 10 is not clamped away on the intermediate "1".
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    commit(raw);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = false;
    const raw = event.target.value;
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value));
    } else {
      const next = clamp(integer ? Math.round(parsed) : parsed, min, max);
      setDraft(String(next));
      if (next !== value) onValueChange(next);
    }
    onBlur?.(event);
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    focusedRef.current = true;
    onFocus?.(event);
  };

  return (
    <input
      {...rest}
      type="number"
      inputMode={integer ? 'numeric' : 'decimal'}
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

export default NumberInput;
