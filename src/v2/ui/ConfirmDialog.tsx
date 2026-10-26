import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog } from '../../m3';

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  /** Body text, or richer content. */
  message?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** `danger` uses the error colors and an alert dialog role. */
  tone?: 'default' | 'danger';
  /** Hero icon above the title. Defaults by tone. */
  icon?: string;
  /** Disables the confirm button (e.g. while the caller is already working). */
  confirmDisabled?: boolean;
  /** Shows the confirm button as busy without awaiting `onConfirm`. */
  busy?: boolean;
  /**
   * Called on confirm. While a returned promise is pending the dialog stays open and busy; it
   * closes itself when the promise resolves unless `closeOnConfirm` is false.
   */
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  closeOnConfirm?: boolean;
  /** Extra keys that cancel (besides Escape), e.g. the shortcut that opened the dialog. */
  dismissKeys?: string[];
  children?: ReactNode;
}

/** Confirmation dialog for decisions, with async confirm and destructive styling. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  icon,
  confirmDisabled,
  busy,
  onConfirm,
  onClose,
  closeOnConfirm = true,
  dismissKeys,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);
  const isBusy = working || !!busy;

  const keys = dismissKeys?.join(',') ?? '';
  useEffect(() => {
    if (!open || !keys) return;
    const extra = keys.split(',');
    const onKey = (e: KeyboardEvent) => {
      if (!extra.includes(e.key)) return;
      e.stopPropagation();
      e.preventDefault();
      if (!isBusy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, keys, isBusy, onClose]);

  // In native fullscreen the browser takes Escape; leaving fullscreen then cancels the dialog.
  useEffect(() => {
    if (!open || document.fullscreenElement == null) return;
    const onChange = () => {
      if (document.fullscreenElement == null && !isBusy) onClose();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [open, isBusy, onClose]);

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
      if (closeOnConfirm) onClose();
    } catch {
      // The caller reports the error; the dialog stays open so the person can retry or cancel.
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !isBusy && onClose()}
      dismissible={!isBusy}
      role={tone === 'danger' ? 'alertdialog' : 'dialog'}
      icon={icon ?? (tone === 'danger' ? 'warning' : 'help')}
      headline={title}
      maxWidth={440}
      className="v2-confirm"
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={isBusy}>
            {cancelLabel ?? t('confirmModal.cancel', 'Cancel')}
          </Button>
          <Button
            variant="filled"
            onClick={() => void confirm()}
            loading={isBusy}
            disabled={confirmDisabled}
            className={tone === 'danger' ? 'v2-button-danger' : undefined}
            data-autofocus
          >
            {confirmLabel ?? t('confirmModal.confirm', 'Confirm')}
          </Button>
        </>
      }
    >
      {message && <div className="v2-confirm__message">{message}</div>}
      {children}
    </Dialog>
  );
}
