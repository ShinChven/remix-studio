import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx, type MaterialShapeName } from '../../m3';
import { errorText } from '../lib/errors';
import { usePaginationScroll } from '../lib/usePaginationScroll';
import type { Selection } from '../lib/useSelection';
import type { ActionMenuItem } from './ActionMenu';
import { ListBar, type ListBarProps } from './ListBar';
import { EmptyState, ErrorState, LoadingState } from './Page';
import { PagedFooter, type PagedFooterProps } from './PagedFooter';
import { SelectionBar, type SelectionAction, type SelectionBarProps } from './SelectionBar';

export interface ListEmpty {
  title: ReactNode;
  description?: ReactNode;
  icon?: string;
  shape?: MaterialShapeName;
  action?: ReactNode;
}

export interface ListPaneProps extends Omit<ListBarProps, 'onSelectAll' | 'selectableCount' | 'refreshing' | 'className'> {
  /** Names the list for screen readers. */
  label: string;
  /** Nothing to show yet: the first load. */
  loading: boolean;
  /** A later load, with the previous rows still on screen. */
  refreshing?: boolean;
  /** Why loading failed. With rows on screen it shows above them; without, in their place. */
  error?: Error | string | null;
  onRetry?: () => void;
  /** Rows on screen. */
  count: number;
  /** Shown when the list holds nothing at all. */
  empty: ListEmpty;
  /** A search or filter is narrowing the list: an empty result then offers to clear it. */
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Replaces the default "nothing matches" wording. */
  noMatches?: Partial<ListEmpty>;
  /** Makes rows selectable; the actions show in a floating toolbar while anything is selected. */
  selection?: Pick<Selection<unknown>, 'count' | 'selectAll' | 'clear'>;
  selectionActions?: SelectionAction[];
  selectionMenu?: ActionMenuItem[];
  allMatching?: SelectionBarProps['allMatching'];
  /** Page navigation under the rows; omit for a list that is not paged. */
  paging?: Omit<PagedFooterProps, 'className'>;
  /** Shown in place of the rows and the empty state, e.g. suggestions for a section with nothing in it. */
  instead?: ReactNode;
  /** Between the bar and the rows, e.g. an upload strip or a notice. */
  before?: ReactNode;
  /** Under the rows, above the paging. */
  after?: ReactNode;
  /** `flush` sits on the page without a surface of its own, for card grids. */
  variant?: 'surface' | 'flush';
  className?: string;
  children: ReactNode;
}

/**
 * One list, start to finish: its bar, its rows, and every state around them. Loading shows once;
 * later loads keep the rows and spin in the bar. A failure never looks like an empty list, and an
 * empty search result is told apart from a list with nothing in it.
 */
export function ListPane({ label, loading, refreshing, error, onRetry, count, empty, filtered = false, onClearFilters, noMatches, selection, selectionActions = [], selectionMenu, allMatching, paging, instead, before, after, variant = 'surface', className, children, ...bar }: ListPaneProps) {
  const { t } = useTranslation();
  const message = error ? errorText(error, t('v2.common.loadFailed')) : null;
  const hasRows = count > 0;
  // A new page starts at its first row instead of wherever the pager was clicked.
  const scrollRef = usePaginationScroll({ page: paging?.page ?? 1, pageSize: paging?.pageSize, enabled: !!paging });

  let body: ReactNode;
  if (loading && !hasRows) body = <LoadingState />;
  else if (message && !hasRows) {
    body = (
      <div className="v2-list-pane__notice">
        <ErrorState message={message} onRetry={onRetry} retryLabel={t('v2.common.retry')} />
      </div>
    );
  } else if (instead) body = instead;
  else if (!hasRows) {
    body = filtered ? (
      <EmptyState
        className="v2-list-pane__empty"
        shape={noMatches?.shape ?? 'puffy'}
        icon={noMatches?.icon ?? 'search_off'}
        title={noMatches?.title ?? t('v2.common.noMatches')}
        description={noMatches?.description ?? t('v2.common.noMatchesHint')}
        action={
          noMatches?.action ??
          (onClearFilters && (
            <Button variant="tonal" icon="filter_alt_off" onClick={onClearFilters}>
              {t('v2.common.clearFilters')}
            </Button>
          ))
        }
      />
    ) : (
      <EmptyState className="v2-list-pane__empty" shape={empty.shape} icon={empty.icon} title={empty.title} description={empty.description} action={empty.action} />
    );
  } else {
    body = (
      <>
        {message && (
          <div className="v2-list-pane__notice">
            <ErrorState message={message} onRetry={onRetry} retryLabel={t('v2.common.retry')} />
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <section ref={scrollRef as Ref<HTMLElement>} className={cx('v2-list-pane', className)} data-variant={variant} aria-label={label} aria-busy={loading || refreshing || undefined}>
      <ListBar {...bar} refreshing={refreshing && hasRows} selectableCount={selection ? count : 0} onSelectAll={selection && hasRows ? selection.selectAll : undefined} />
      {before}
      {body}
      {after}
      {paging && hasRows && <PagedFooter className="v2-list-pane__footer" {...paging} />}
      {selection && <SelectionBar selectedCount={selection.count} totalCount={count} onSelectAll={selection.selectAll} onClear={selection.clear} actions={selectionActions} menuItems={selectionMenu} allMatching={allMatching} />}
    </section>
  );
}
