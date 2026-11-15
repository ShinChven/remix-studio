import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChipSet, Dialog, InputChip, Text, TextField } from '../../m3';

export interface TagDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (tags: string[]) => void;
  initialTags?: string[];
  title?: string;
  description?: string;
  saveButtonText?: string;
  /** Save every add and remove as it happens; the dialog then only offers Done. */
  autoSave?: boolean;
}

/** Edits a list of tags: type one or several (comma separated), remove with the chip's ×. */
export function TagDialog({ open, onClose, onSave, initialTags = [], title, description, saveButtonText, autoSave = false }: TagDialogProps) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (open) {
      setTags(initialTags);
      setInput('');
    }
    // Reset only when the dialog opens, not as the caller re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (next: string[]) => {
    setTags(next);
    if (autoSave) onSave(next);
  };

  /** Folds whatever is typed in the field into the list; returns the resulting list. */
  const add = () => {
    const typed = input.split(',').map((x) => x.trim()).filter(Boolean);
    setInput('');
    const next = Array.from(new Set([...tags, ...typed]));
    if (next.length !== tags.length) commit(next);
    return next;
  };

  const remove = (tag: string) => commit(tags.filter((x) => x !== tag));

  // Closing an auto-saving dialog keeps anything still typed in the field.
  const close = () => {
    if (autoSave) add();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      icon="sell"
      headline={title ?? t('tagModal.title')}
      maxWidth={520}
      actions={
        autoSave ? (
          <Button variant="filled" onClick={close}>
            {t('tagFilter.done')}
          </Button>
        ) : (
          <>
            <Button variant="text" onClick={onClose}>
              {t('confirmModal.cancel')}
            </Button>
            <Button
              variant="filled"
              onClick={() => {
                onSave(tags);
                onClose();
              }}
            >
              {saveButtonText ?? t('tagModal.saveTags')}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Text variant="body-medium" className="text-on-surface-variant">
          {description ?? t('tagModal.description')}
        </Text>
        <div className="flex items-start gap-2">
          <TextField
            variant="outlined"
            label={t('tagModal.placeholder')}
            value={input}
            onValueChange={setInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            className="flex-1"
            fullWidth
            data-autofocus
          />
          <Button variant="tonal" size="md" icon="add" onClick={add}>
            {t('tagModal.add')}
          </Button>
        </div>
        {tags.length === 0 ? (
          <Text variant="body-medium" className="v2-dashed-note">
            {t('tagModal.noTags')}
          </Text>
        ) : (
          <ChipSet>
            {tags.map((tag) => (
              <InputChip key={tag} label={tag} icon="sell" onRemove={() => remove(tag)} />
            ))}
          </ChipSet>
        )}
      </div>
    </Dialog>
  );
}
