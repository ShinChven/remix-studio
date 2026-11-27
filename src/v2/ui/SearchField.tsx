import { useEffect, useRef } from 'react';
import { cx, TextField } from '../../m3';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter, and with '' when the field is cleared. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** `pill` for page toolbars, `field` to sit among other form fields. */
  shape?: 'pill' | 'field';
  autoFocus?: boolean;
  'aria-label'?: string;
}

/** Search input for filtering a list: Enter applies, the clear button resets. */
export function SearchField({ value, onChange, onSubmit, placeholder, className, shape = 'pill', autoFocus, ...rest }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Native autofocus scrolls every ancestor to reveal the field, which slides it up inside a dialog.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  return (
    <TextField
      ref={inputRef}
      variant="outlined"
      type="search"
      leadingIcon="search"
      value={value}
      placeholder={placeholder}
      aria-label={rest['aria-label'] ?? placeholder}
      onValueChange={onChange}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit?.(value);
        }
      }}
      onClear={
        value
          ? () => {
              onChange('');
              onSubmit?.('');
            }
          : undefined
      }
      className={cx('v2-search-field', shape === 'pill' && 'v2-search-field--pill', className)}
    />
  );
}
