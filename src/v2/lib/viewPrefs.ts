import { useState } from 'react';

/** A view choice remembered on this device, e.g. a grid size; falls back when storage is unavailable or holds something else. */
export function useViewPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && allowed.includes(stored) ? stored : fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // The choice then lasts for this visit only.
    }
  };
  return [value, update];
}
