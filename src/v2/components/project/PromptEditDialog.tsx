import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, Text } from '../../../m3';
import type { WorkflowItem } from '../../../types';

/** Full-size editor for one text step of the workflow. */
export function PromptEditDialog({ item, onClose, onSave }: { item: WorkflowItem | null; onClose: () => void; onSave: (value: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (item) setValue(item.value);
  }, [item]);

  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      icon="text_fields"
      headline={t('projectViewer.promptModal.title')}
      fullScreen="compact"
      maxWidth={960}
      className="v2-prompt-dialog"
      actions={
        <>
          <Text variant="label-small" className="me-auto uppercase tracking-widest text-on-surface-variant">
            {t('projectViewer.promptModal.characterCount', { count: value.length })}
          </Text>
          <Button variant="text" onClick={onClose}>
            {t('projectViewer.common.cancel')}
          </Button>
          <Button variant="filled" icon="save" onClick={() => onSave(value)}>
            {t('projectViewer.promptModal.saveChanges')}
          </Button>
        </>
      }
    >
      <Text variant="label-small" className="mb-2 uppercase tracking-widest text-on-surface-variant">
        {t('projectViewer.promptModal.description')}
      </Text>
      <textarea
        data-autofocus
        className="v2-prompt-dialog__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('projectViewer.promptModal.placeholder')}
        aria-label={t('projectViewer.promptModal.title')}
      />
    </Dialog>
  );
}
