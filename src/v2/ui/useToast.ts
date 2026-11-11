import { useMemo } from 'react';
import { useSnackbar, type SnackbarAction } from '../../m3';

export interface ToastOptions {
  /** One follow-up, e.g. "View" or "Undo". */
  action?: SnackbarAction;
}

/** Success, error and info notices, all shown as snackbars. Errors stay until dismissed. */
export function useToast() {
  const snackbar = useSnackbar();
  return useMemo(
    () => ({
      success: (message: string, options?: ToastOptions) => snackbar.show(options?.action ? { message, action: options.action } : message),
      info: (message: string, options?: ToastOptions) => snackbar.show(options?.action ? { message, action: options.action } : message),
      error: (message: string, options?: ToastOptions) => snackbar.show({ message, closable: true, action: options?.action }),
    }),
    [snackbar],
  );
}
