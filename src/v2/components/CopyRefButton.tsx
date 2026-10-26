import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, useSnackbar, type ButtonSize, type IconButtonVariant } from '../../m3';
import { copyText } from '../../lib/resource-ref';

/** Copies an item's AI reference (built with `resourceRef`) without opening or selecting the item. */
export function CopyRefButton({ reference, size = 'xs', variant = 'standard', className }: { reference: string; size?: ButtonSize; variant?: IconButtonVariant; className?: string }) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconButton
      icon={copied ? 'check' : 'tag'}
      label={t('resourceRef.copy')}
      tooltip
      size={size}
      variant={variant}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await copyText(reference);
          setCopied(true);
          snackbar.show(`${t('resourceRef.copied')} · ${reference}`);
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1500);
        } catch {
          snackbar.show(`${t('resourceRef.copyFailed')} · ${reference}`);
        }
      }}
    />
  );
}
