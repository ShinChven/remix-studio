import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, IconButton, Text, useSnackbar } from '../../m3';

/** A read-only value with a copy button, e.g. a URL, token or command. */
export function CopyField({ label, value, copiedMessage, className, mono = true }: { label?: ReactNode; value: string; copiedMessage?: string; className?: string; mono?: boolean }) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copiedMessage) snackbar.show(copiedMessage);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The clipboard can be blocked on plain HTTP; the value stays selectable.
    }
  };
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      {label && (
        <Text as="span" variant="label-medium" className="text-on-surface-variant">
          {label}
        </Text>
      )}
      <div className="v2-copy-field">
        <code className={cx('min-w-0 flex-1 truncate select-all', mono && 'font-mono')}>{value}</code>
        <IconButton icon={copied ? 'check' : 'content_copy'} label={t('mediaShare.common.copy', 'Copy')} tooltip size="xs" onClick={() => void copy()} />
      </div>
    </div>
  );
}

/** A labelled value that is not meant to be copied, shown as a dashed hint. */
export function StaticField({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text as="span" variant="label-medium" className="text-on-surface-variant">
        {label}
      </Text>
      <div className="v2-static-field">{value}</div>
    </div>
  );
}
