import { createContext, useContext } from 'react';

/** Opens the appearance panel from anywhere inside the app shell. */
export const ThemeEditorContext = createContext<() => void>(() => {});

export function useOpenThemeEditor() {
  return useContext(ThemeEditorContext);
}
