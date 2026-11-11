import { useCallback, useMemo, useState } from 'react';
import type { AlbumTagMatch } from '../../../types';
import { DEFAULT_ALBUM_PAGE_SIZE, getRememberedAlbumPageSize, parseAlbumPageSize, rememberAlbumPageSize, type AlbumPageSize } from '../../../lib/album-page-size-memory';
import { useListParams } from '../../lib/useListParams';

export type AlbumSort = 'newest' | 'oldest';

export interface AlbumParamsUpdate {
  page?: number;
  pageSize?: AlbumPageSize;
  sort?: AlbumSort;
  ratios?: string[];
  tags?: string[];
  tagMatch?: AlbumTagMatch;
  search?: string;
}

const KEYS = { page: 'albumPage', q: 'albumSearch', size: 'albumSize' } as const;
const DEFAULTS = { albumSort: 'newest', albumTagMatch: 'all' };
const NO_ALIASES = {};
const split = (value: string) => (value ? value.split(',').filter(Boolean) : []);

/**
 * How a project's album is being viewed: page, size, search, order and filters, kept in the
 * address under `album…` keys so they sit beside the page's own `tab`. Without a size in the
 * address the album uses the one last picked for this project in this browser.
 */
export function useAlbumParams(projectId: string) {
  const list = useListParams({ pageSize: DEFAULT_ALBUM_PAGE_SIZE, keys: KEYS, defaults: DEFAULTS, aliases: NO_ALIASES });
  // The viewer is reused across projects, so the remembered size is tied to the project it was read for.
  const [remembered, setRemembered] = useState(() => ({ projectId, size: getRememberedAlbumPageSize(projectId) }));
  const defaultSize = remembered.projectId === projectId ? remembered.size : getRememberedAlbumPageSize(projectId);
  const pageSize: AlbumPageSize = parseAlbumPageSize(list.get(KEYS.size) || null) ?? defaultSize;
  const ratiosParam = list.get('albumRatios');
  const tagsParam = list.get('albumTags');
  const ratios = useMemo(() => split(ratiosParam), [ratiosParam]);
  const tags = useMemo(() => split(tagsParam), [tagsParam]);
  const { set } = list;

  /** Anything but a page change returns to the first page. */
  const update = useCallback(
    (updates: AlbumParamsUpdate) => {
      const patch: Record<string, string | number | null> = {};
      if (updates.page !== undefined) patch[KEYS.page] = updates.page;
      if (updates.pageSize !== undefined) patch[KEYS.size] = updates.pageSize;
      if (updates.sort !== undefined) patch.albumSort = updates.sort;
      if (updates.ratios !== undefined) patch.albumRatios = updates.ratios.join(',');
      if (updates.tags !== undefined) patch.albumTags = updates.tags.join(',');
      if (updates.tagMatch !== undefined) patch.albumTagMatch = updates.tagMatch;
      if (updates.search !== undefined) patch[KEYS.q] = updates.search;
      set(patch);
    },
    [set],
  );

  const setPageSize = useCallback(
    (size: AlbumPageSize) => {
      rememberAlbumPageSize(projectId, size);
      setRemembered({ projectId, size });
      update({ pageSize: size });
    },
    [projectId, update],
  );

  return {
    page: list.page,
    pageSize,
    search: list.q,
    sort: list.oneOf('albumSort', ['newest', 'oldest'] as const),
    ratios,
    tags,
    tagMatch: list.oneOf('albumTagMatch', ['all', 'any'] as const),
    update,
    setPageSize,
  };
}
