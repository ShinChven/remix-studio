import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLibraries } from '../../../api';
import { Button, Dialog, LoadingIndicator, Select, Text } from '../../../m3';
import type { Library, LibraryType } from '../../../types';

export interface CopyMoveItemsDialogProps {
  open: boolean;
  action: 'copy' | 'move';
  sourceLibraryId: string;
  libraryType: LibraryType;
  itemCount: number;
  onClose: () => void;
  /** Rejects to keep the dialog open. */
  onConfirm: (destinationLibraryId: string) => Promise<void>;
}

/** Picks another library of the same type to copy or move the selected items into. */
export function CopyMoveItemsDialog({ open, action, sourceLibraryId, libraryType, itemCount, onClose, onConfirm }: CopyMoveItemsDialogProps) {
  const { t } = useTranslation();
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSubmitting(false);
    setTarget('');
    setLoading(true);
    fetchLibraries(1, 100)
      .then((res) => {
        if (!alive) return;
        const valid = res.items.filter((lib) => lib.id !== sourceLibraryId && lib.type === libraryType);
        setLibraries(valid);
        if (valid.length > 0) setTarget(valid[0].id);
      })
      .catch((err) => console.error('Failed to load libraries', err))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, sourceLibraryId, libraryType]);

  const confirm = async () => {
    if (!target || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(target);
      onClose();
    } catch (e) {
      console.error(e);
      setSubmitting(false);
    }
  };

  const isCopy = action === 'copy';
  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      dismissible={!submitting}
      icon={isCopy ? 'content_copy' : 'drive_file_move'}
      headline={isCopy ? t('libraryEditor.copyItemsTitle', 'Copy Items') : t('libraryEditor.moveItemsTitle', 'Move Items')}
      maxWidth={480}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={submitting}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="filled" loading={submitting} disabled={!target} onClick={() => void confirm()}>
            {isCopy ? t('libraryEditor.confirmCopy', 'Copy') : t('libraryEditor.confirmMove', 'Move')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {isCopy
            ? t('libraryEditor.copyItemsDescription', { defaultValue: 'Select a destination library to copy {{count}} items to.', count: itemCount })
            : t('libraryEditor.moveItemsDescription', { defaultValue: 'Select a destination library to move {{count}} items to.', count: itemCount })}
        </Text>
        {loading ? (
          <div className="flex items-center gap-3 text-on-surface-variant">
            <LoadingIndicator size={32} />
            <Text variant="body-medium">{t('common.loading', 'Loading...')}</Text>
          </div>
        ) : libraries.length === 0 ? (
          <Text variant="body-medium" className="v2-dashed-note">
            {t('libraryEditor.noCompatibleLibraries', 'No compatible libraries found.')}
          </Text>
        ) : (
          <Select
            variant="outlined"
            label={t('libraryEditor.destinationLibrary', 'Destination Library')}
            value={target}
            onChange={setTarget}
            options={libraries.map((lib) => ({ value: lib.id, label: lib.name }))}
            fullWidth
          />
        )}
      </div>
    </Dialog>
  );
}
