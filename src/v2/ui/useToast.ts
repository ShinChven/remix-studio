import { useMemo } from 'react';
import { useSnackbar } from '../../m3';

/** Success, error and info notices, all shown as snackbars. */
export function useToast() {
  const snackbar = useSnackbar();
  return useMemo(
    () => ({
      success: (message: string) => snackbar.show(message),
      info: (message: string) => snackbar.show(message),
      error: (message: string) => snackbar.show({ message, closable: true }),
    }),
    [snackbar],
  );
}
