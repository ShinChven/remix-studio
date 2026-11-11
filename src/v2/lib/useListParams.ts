import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type PageSize = number | 'all';

/** Page sizes every paged list offers unless it names its own. */
export const PAGE_SIZES: readonly PageSize[] = [25, 50, 100, 200, 500, 'all'];

/** A value for the address bar; null, undefined and '' remove the key. A list repeats the key once per entry. */
/** Page sizes for a grid of cards: each fills whole rows at two, three and four columns. */
export const CARD_PAGE_SIZES: readonly PageSize[] = [24, 48, 96];

export type ParamValue = string | number | null | undefined | readonly string[];

export interface ListParamsOptions {
  /** Size used when the address names none. */
  pageSize?: PageSize;
  /** Sizes the address may name; anything else falls back to `pageSize`. Omit for a fixed size. */
  pageSizes?: readonly PageSize[];
  /** Values that stay out of the address, e.g. `{ status: 'active', sort: 'newest' }`. */
  defaults?: Record<string, string>;
  /** Renames the standard keys for a list that shares its page with another, e.g. `{ page: 'albumPage' }`. */
  keys?: Partial<Record<'q' | 'page' | 'size', string>>;
  /** Older names still read from saved links, rewritten to the current key, e.g. `{ size: ['pageSize', 'limit'] }`. */
  aliases?: Record<string, string[]>;
}

export interface ListParams {
  q: string;
  page: number;
  pageSize: PageSize;
  /** A filter or sort from the address, or its default. */
  get: (key: string) => string;
  /** Every value of a key that may repeat, e.g. several tags. */
  getAll: (key: string) => string[];
  /** The value when it is one of `allowed`, otherwise the first of them. */
  oneOf: <T extends string>(key: string, allowed: readonly T[]) => T;
  /** Writes several keys at once. Anything but a page change returns to the first page. */
  set: (patch: Record<string, ParamValue>, options?: { replace?: boolean; keepPage?: boolean }) => void;
  setQuery: (q: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  /** True while a search or a non-default filter narrows the list. */
  filtered: boolean;
  /** Drops the search and every filter named in `defaults`. */
  clearFilters: () => void;
}

const DEFAULT_ALIASES: Record<string, string[]> = { size: ['pageSize', 'limit'] };
/** Defaults that arrange the list rather than narrow it. */
const ARRANGING = new Set(['sort', 'sortBy', 'sortOrder', 'view', 'tab', 'layout']);

function parseSize(raw: string | null, fallback: PageSize, allowed?: readonly PageSize[]): PageSize {
  if (!raw || !allowed) return fallback;
  const value: PageSize = raw === 'all' ? 'all' : Number(raw);
  return allowed.includes(value) ? value : fallback;
}

/**
 * A list's search, page, page size, filters and sort, kept in the address so a reload, a shared
 * link and the back button all return to the same view. Defaults never appear in the address.
 */
export function useListParams({ pageSize: defaultSize = 25, pageSizes, defaults, keys, aliases = DEFAULT_ALIASES }: ListParamsOptions = {}): ListParams {
  const [params, setParams] = useSearchParams();
  const qKey = keys?.q ?? 'q';
  const pageKey = keys?.page ?? 'page';
  const sizeKey = keys?.size ?? 'size';

  // The option objects are written inline by callers; their contents are what matters.
  const defaultsKey = JSON.stringify(defaults ?? {});
  const aliasKey = JSON.stringify(aliases);
  const stableDefaults = useMemo(() => (defaults ?? {}) as Record<string, string>, [defaultsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stableAliases = useMemo(() => aliases, [aliasKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const read = useCallback(
    (key: string): string | null => {
      const direct = params.get(key);
      if (direct !== null) return direct;
      const logical = key === sizeKey ? 'size' : key;
      for (const alias of stableAliases[logical] ?? []) {
        const old = params.get(alias);
        if (old !== null) return old;
      }
      return null;
    },
    [params, sizeKey, stableAliases],
  );

  // Saved links with an older key are rewritten once, so the address shows one name per setting.
  useEffect(() => {
    const stale = Object.entries(stableAliases).flatMap(([logical, olds]) => olds.filter((old) => params.has(old)).map((old) => [logical === 'size' ? sizeKey : logical, old] as const));
    if (stale.length === 0) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, old] of stale) {
          const value = next.get(old);
          next.delete(old);
          if (value !== null && !next.has(key)) next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }, [params, setParams, sizeKey, stableAliases]);

  const q = read(qKey) ?? '';
  const page = Math.max(1, parseInt(read(pageKey) ?? '1', 10) || 1);
  const pageSize = parseSize(read(sizeKey), defaultSize, pageSizes);

  const set = useCallback<ListParams['set']>(
    (patch, options) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let moved = false;
          for (const [key, raw] of Object.entries(patch)) {
            if (Array.isArray(raw)) {
              const before = next.getAll(key).join('\u0000');
              next.delete(key);
              for (const entry of raw) next.append(key, entry);
              if (raw.join('\u0000') !== before) moved = true;
              continue;
            }
            const value = raw === null || raw === undefined ? '' : String(raw).trim();
            const fallback = key === pageKey ? '1' : key === sizeKey ? String(defaultSize) : (stableDefaults[key] ?? '');
            const before = next.get(key) ?? fallback;
            if (value === '' || value === fallback) next.delete(key);
            else next.set(key, value);
            if (key !== pageKey && (next.get(key) ?? fallback) !== before) moved = true;
          }
          if (moved && !options?.keepPage && !(pageKey in patch)) next.delete(pageKey);
          return next;
        },
        { replace: options?.replace },
      );
    },
    [setParams, pageKey, sizeKey, defaultSize, stableDefaults],
  );

  const getAll = useCallback((key: string) => params.getAll(key), [params]);
  const get = useCallback((key: string) => read(key) ?? stableDefaults[key] ?? '', [read, stableDefaults]);
  const oneOf = useCallback(
    <T extends string>(key: string, allowed: readonly T[]): T => {
      const value = get(key) as T;
      return allowed.includes(value) ? value : ((allowed.includes(stableDefaults[key] as T) ? stableDefaults[key] : allowed[0]) as T);
    },
    [get, stableDefaults],
  );

  const setQuery = useCallback((value: string) => set({ [qKey]: value }, { replace: true }), [set, qKey]);
  const setPage = useCallback((value: number) => set({ [pageKey]: value }), [set, pageKey]);
  const setPageSize = useCallback((value: PageSize) => set({ [sizeKey]: value }), [set, sizeKey]);
  const clearFilters = useCallback(() => set({ [qKey]: '', ...Object.fromEntries(Object.keys(stableDefaults).filter((key) => !ARRANGING.has(key)).map((key) => [key, ''])) }), [set, qKey, stableDefaults]);

  const filtered = q !== '' || Object.keys(stableDefaults).some((key) => !ARRANGING.has(key) && get(key) !== stableDefaults[key]);

  return { q, page, pageSize, get, getAll, oneOf, set, setQuery, setPage, setPageSize, filtered, clearFilters };
}

/** The slice of `items` on `page`, for a list paged in the browser, with the page clamped to what exists. */
export function pageOf<T>(items: T[], page: number, pageSize: PageSize): { items: T[]; page: number; pages: number } {
  if (pageSize === 'all') return { items, page: 1, pages: 1 };
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pages };
}
