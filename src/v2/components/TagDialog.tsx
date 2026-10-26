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
}

/** Edits a list of tags: type one or several (comma separated), remove with the chip's ×. */
export function TagDialog({ open, onClose, onSave, initialTags = [], title, description, saveButtonText }: TagDialogProps) {
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

  const add = () => {
    const next = input.split(',').map((x) => x.trim()).filter(Boolean);
    setTags((current) => Array.from(new Set([...current, ...next])));
    setInput('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon="sell"
      headline={title ?? t('tagModal.title')}
      maxWidth={520}
      actions={
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
              <InputChip key={tag} label={tag} icon="sell" onRemove={() => setTags((current) => current.filter((x) => x !== tag))} />
            ))}
          </ChipSet>
        )}
      </div>
    </Dialog>
  );
}
