import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, TextField } from '../../m3';

export interface PromptDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  icon?: string;
  label: ReactNode;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  /** Multi-line input. */
  multiline?: boolean;
  /** Allows confirming an empty value. */
  allowEmpty?: boolean;
  maxLength?: number;
  supportingText?: ReactNode;
  /** Returns normally to close; throws to keep the dialog open. */
  onConfirm: (value: string) => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}

/** Dialog that asks for one text value: rename, duplicate as, set text. */
export function PromptDialog({
  open,
  title,
  description,
  icon,
  label,
  initialValue = '',
  placeholder,
  confirmLabel,
  cancelLabel,
  multiline,
  allowEmpty,
  maxLength,
  supportingText,
  onConfirm,
  onClose,
  children,
}: PromptDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [open, initialValue]);

  const submit = async () => {
    const trimmed = multiline ? value : value.trim();
    if ((!allowEmpty && !trimmed.trim()) || busy) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      onClose();
    } catch {
      // The caller reports the failure; keep the dialog open for another try.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      icon={icon}
      headline={title}
      maxWidth={520}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('confirmModal.cancel', 'Cancel')}
          </Button>
          <Button variant="filled" loading={busy} disabled={!allowEmpty && !value.trim()} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {description && <div className="text-on-surface-variant">{description}</div>}
        <TextField
          variant="outlined"
          label={label}
          value={value}
          onValueChange={setValue}
          placeholder={placeholder}
          multiline={multiline}
          rows={multiline ? 4 : undefined}
          maxRows={multiline ? 12 : undefined}
          maxLength={maxLength}
          supportingText={supportingText}
          fullWidth
          data-autofocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {children}
      </div>
    </Dialog>
  );
}
