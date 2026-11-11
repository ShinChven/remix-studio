import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/useToast';

/** Copies text and says so, or says that the browser refused. Resolves to whether it worked. */
export function useCopy() {
  const { t } = useTranslation();
  const toast = useToast();
  return useCallback(
    async (text: string, copiedMessage?: string, failedMessage?: string): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(copiedMessage ?? t('v2.common.copied'));
        return true;
      } catch (error) {
        console.error(error);
        toast.error(failedMessage ?? t('v2.common.copyFailed'));
        return false;
      }
    },
    [t, toast],
  );
}
