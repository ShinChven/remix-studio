import { useTranslation } from 'react-i18next';
import { Button, Dialog, Text } from '../../../m3';

export interface PromptLimitDialogProps {
  open: boolean;
  modelName: string;
  affectedCount: number;
  limitLabel: string;
  longestPromptLabel: string;
  onTruncate: () => void;
  onKeep: () => void;
  onCancel: () => void;
}

/** Asks what to do with prompts longer than the model accepts: cut them, keep them, or stop. */
export function PromptLimitDialog({ open, modelName, affectedCount, limitLabel, longestPromptLabel, onTruncate, onKeep, onCancel }: PromptLimitDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      icon="warning"
      headline={t('projectViewer.promptLimitModal.title')}
      maxWidth={560}
      actions={
        <>
          <Button variant="text" onClick={onCancel}>
            {t('projectViewer.promptLimitModal.cancel')}
          </Button>
          <Button variant="tonal" onClick={onKeep}>
            {t('projectViewer.promptLimitModal.keep')}
          </Button>
          <Button variant="filled" icon="content_cut" onClick={onTruncate}>
            {t('projectViewer.promptLimitModal.truncate')}
          </Button>
        </>
      }
    >
      <Text variant="body-medium" className="text-on-surface-variant">
        {t('projectViewer.promptLimitModal.message', { count: affectedCount, model: modelName, limit: limitLabel, longest: longestPromptLabel })}
      </Text>
    </Dialog>
  );
}
