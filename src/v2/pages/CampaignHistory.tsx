import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchCampaignHistory } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { Button, ChipSet, FilterChip, IconButton, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PostingTrendChart, lastNDaysRange } from '../components/campaigns/PostingTrendChart';
import { fallbackExternalUrl } from '../lib/platform';
import { EmptyState, Page, PageHeader, Section } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { Row, RowList } from '../ui/Rows';
import { SearchField } from '../ui/SearchField';
import { StatusPill } from '../ui/Stat';
import { Segmented } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

/** Quick ranges, in URL-friendly ids. `null` days means "all time" (no lower bound). */
const RANGE_PRESETS = [
  { id: '7d', days: 7 },
  { id: '14d', days: 14 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '180d', days: 180 },
  { id: '1y', days: 365 },
  { id: 'all', days: null },
] as const;

type RangePresetId = (typeof RANGE_PRESETS)[number]['id'];

const DEFAULT_PRESET: RangePresetId = '30d';

function isPresetId(value: string): value is RangePresetId {
  return RANGE_PRESETS.some((preset) => preset.id === value);
}

function presetDays(id: RangePresetId) {
  return RANGE_PRESETS.find((preset) => preset.id === id)?.days ?? null;
}

/** `YYYY-MM-DD` in the user's local timezone. */
function toDateInput(value: Date) {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function parseDateInput(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Every published or failed post over a time range, as a list or as the posting-trend chart. */
export function CampaignHistory() {
  const toast = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const qParam = searchParams.get('q') || '';
  const rangeParam = searchParams.get('range') || '';

  const [searchQuery, setSearchQuery] = useState(qParam);

  const view = searchParams.get('view') === 'chart' ? 'chart' : 'list';

  // One range drives both views. Explicit dates in the URL mean the custom
  // range is in play; otherwise a quick preset is (30 days by default).
  const hasCustomDates = Boolean(startDateParam || endDateParam);
  const [customOpen, setCustomOpen] = useState(hasCustomDates);
  const isCustomRange = hasCustomDates || customOpen;
  const preset: RangePresetId = isPresetId(rangeParam) ? rangeParam : DEFAULT_PRESET;
  const activeRangeId = isCustomRange ? 'custom' : preset;

  /**
   * The effective range, as dates for the chart and as `YYYY-MM-DD` bounds for
   * the list request. A missing bound is genuinely unbounded on that side.
   */
  const range = useMemo(() => {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    if (isCustomRange) {
      const from = parseDateInput(startDateParam);
      const to = parseDateInput(endDateParam);
      const toEnd = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999) : todayEnd;
      return {
        from,
        to: toEnd,
        apiStart: from ? toDateInput(from) : '',
        apiEnd: to ? toDateInput(to) : '',
      };
    }

    const days = presetDays(preset);
    if (days == null) return { from: null, to: todayEnd, apiStart: '', apiEnd: '' };

    const { from, to } = lastNDaysRange(days);
    return { from, to, apiStart: toDateInput(from), apiEnd: toDateInput(to) };
  }, [isCustomRange, startDateParam, endDateParam, preset]);

  const setView = (nextView: 'list' | 'chart') => {
    const params = new URLSearchParams(searchParams);
    if (nextView === 'chart') params.set('view', 'chart');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const selectPreset = (id: RangePresetId) => {
    const params = new URLSearchParams(searchParams);
    params.delete('startDate');
    params.delete('endDate');
    if (id === DEFAULT_PRESET) params.delete('range');
    else params.set('range', id);
    params.set('page', '1');
    setCustomOpen(false);
    setSearchParams(params);
  };

  const openCustomRange = () => {
    setCustomOpen(true);
    if (hasCustomDates) return;
    // Seed the inputs with whatever is on screen so the switch isn't a reset.
    const params = new URLSearchParams(searchParams);
    const seed = range.from ?? lastNDaysRange(30).from;
    params.set('startDate', toDateInput(seed));
    params.set('endDate', toDateInput(range.to));
    params.delete('range');
    params.set('page', '1');
    setSearchParams(params);
  };

  /** Applies a custom bound immediately; an inverted range is swapped, not rejected. */
  const setCustomBound = (bound: 'start' | 'end', value: string) => {
    let nextStart = bound === 'start' ? value : startDateParam;
    let nextEnd = bound === 'end' ? value : endDateParam;
    if (nextStart && nextEnd && nextStart > nextEnd) [nextStart, nextEnd] = [nextEnd, nextStart];

    const params = new URLSearchParams(searchParams);
    if (nextStart) params.set('startDate', nextStart);
    else params.delete('startDate');
    if (nextEnd) params.set('endDate', nextEnd);
    else params.delete('endDate');
    params.delete('range');
    params.set('page', '1');
    setCustomOpen(true);
    setSearchParams(params);
  };

  const loadHistory = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchCampaignHistory(
        page,
        pageSize,
        range.apiStart,
        range.apiEnd,
        qParam,
        new Date().getTimezoneOffset(),
      );
      setHistory(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('[CampaignHistory] error:', error);
      toast.error((error as Error).message || 'Failed to load campaign history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // The chart pulls its own aggregates, so skip the list request while it is shown.
    if (view === 'list') void loadHistory();
    setSearchQuery(qParam);
  }, [page, pageSize, range.apiStart, range.apiEnd, qParam, view]);

  // Posts published or edited elsewhere (another tab, an MCP agent, the scheduler).
  useLiveRefresh(
    (event) => event.resource === 'post' || event.resource === 'campaign',
    () => loadHistory(true),
    { enabled: view === 'list' },
  );

  const applySearch = () => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (searchQuery) params.set('q', searchQuery);
    else params.delete('q');
    setSearchParams(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('startDate');
    params.delete('endDate');
    params.delete('range');
    params.delete('q');
    params.set('page', '1');
    setSearchQuery('');
    setCustomOpen(false);
    setSearchParams(params);
  };

  const hasActiveFilters = hasCustomDates
    || Boolean(qParam)
    || Boolean(rangeParam && rangeParam !== DEFAULT_PRESET);

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

  // The chip row scrolls sideways on phones, so keep the active chip in view.
  const activeChipRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeRangeId]);

  const rangeLabel = (id: RangePresetId) => {
    if (id === 'all') return t('postingTrend.allTime');
    if (id === '1y') return t('postingTrend.lastYear');
    return t('postingTrend.lastNDays', { days: presetDays(id) });
  };


  return (
    <Page density="compact">
      <PageHeader title="History" description="Audit log of your posts." backLink={{ to: '/campaigns', label: 'Back' }} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<'list' | 'chart'>
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('postingTrend.listView'), icon: 'list' },
              { value: 'chart', label: t('postingTrend.chartView'), icon: 'show_chart' },
            ]}
          />
          <SearchField value={searchQuery} onChange={setSearchQuery} onSubmit={() => applySearch()} placeholder="Search history..." className="v2-header-search" />
          {hasActiveFilters && (
            <Button variant="text" size="xs" icon="filter_alt_off" onClick={clearFilters}>
              {t('postingTrend.resetRange')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipSet scroll>
            {RANGE_PRESETS.map(({ id }) => (
              <span key={id} ref={activeRangeId === id ? (activeChipRef as React.RefObject<HTMLSpanElement>) : undefined}>
                <FilterChip label={rangeLabel(id)} selected={activeRangeId === id} onClick={() => selectPreset(id)} />
              </span>
            ))}
            <span ref={activeRangeId === 'custom' ? (activeChipRef as React.RefObject<HTMLSpanElement>) : undefined}>
              <FilterChip label={t('postingTrend.customRange')} icon="calendar_month" selected={activeRangeId === 'custom'} onClick={openCustomRange} />
            </span>
          </ChipSet>
          {isCustomRange && (
            <span className="flex items-center gap-2">
              <TextField variant="outlined" type="date" aria-label={t('postingTrend.rangeStart')} value={startDateParam} max={endDateParam || undefined} onValueChange={(v) => setCustomBound('start', v)} />
              <Text as="span" variant="label-small" className="text-on-surface-variant">
                TO
              </Text>
              <TextField variant="outlined" type="date" aria-label={t('postingTrend.rangeEnd')} value={endDateParam} min={startDateParam || undefined} onValueChange={(v) => setCustomBound('end', v)} />
            </span>
          )}
        </div>
        {view === 'chart' ? (
          <Section variant="card">
            <PostingTrendChart from={range.from} to={range.to} height={280} />
          </Section>
        ) : isLoading ? (
          <RowList>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="v2-skeleton" style={{ height: 56 }} />
            ))}
          </RowList>
        ) : history.length === 0 ? (
          <EmptyState icon="history" shape="clover-4" title="No history yet" description="Your sending history will appear here once you start publishing posts." />
        ) : (
          <RowList>
            {history.map((post) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const execution = post.executions?.find((ex: any) => ex.externalUrl) || post.executions?.[0];
              const account = execution?.socialAccount;
              const platform = account?.platform || 'Unknown';
              const externalUrl = execution?.externalUrl || fallbackExternalUrl(platform, execution?.externalId);
              const updated = new Date(post.updatedAt);
              return (
                <Row
                  key={post.id}
                  lead={<AccountAvatar account={account} seed={post.id} size={36} refreshOn={['twitter', 'x', 'threads']} />}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {account?.profileName || 'Unknown Account'}
                      <StatusPill tone={post.status === 'completed' ? 'success' : 'error'}>{post.status === 'completed' ? 'Published' : 'Failed'}</StatusPill>
                    </span>
                  }
                  meta={
                    <>
                      <span className="uppercase">{platform}</span>
                      <span>·</span>
                      <button type="button" className="v2-link" onClick={() => navigate(`/campaigns/${post.campaign?.id}`)}>
                        {post.campaign?.name || 'Unknown Campaign'}
                      </button>
                      <span>·</span>
                      <span className="tabular-nums">
                        {updated.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {post.status === 'failed' && execution?.errorMsg && (
                        <span className="w-full truncate text-error" title={execution.errorMsg}>
                          {execution.errorMsg}
                        </span>
                      )}
                    </>
                  }
                  actions={
                    <>
                      {externalUrl && <IconButton icon="open_in_new" size="xs" label="View live post" tooltip href={externalUrl} target="_blank" rel="noopener noreferrer" />}
                      <IconButton icon="arrow_forward" size="xs" label="Manage" tooltip href={`/campaigns/${post.campaign?.id}/posts/edit/${post.id}`} />
                    </>
                  }
                />
              );
            })}
          </RowList>
        )}
        {view === 'list' && !isLoading && totalPages > 1 && (
          <div className="v2-paged-footer">
            <Text variant="label-medium" className="text-on-surface-variant">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
            </Text>
            <Pagination page={page} pages={totalPages} onPageChange={updatePage} />
          </div>
        )}
      </div>
    </Page>
  );
}
