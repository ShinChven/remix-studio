import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchCampaignHistory } from '../../api';
import { ChipSet, FilterChip, IconButton, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PostingTrendChart, lastNDaysRange } from '../components/campaigns/PostingTrendChart';
import { errorText } from '../lib/errors';
import { fallbackExternalUrl } from '../lib/platform';
import { useAsyncData } from '../lib/useAsyncData';
import { PAGE_SIZES, useListParams } from '../lib/useListParams';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';
import { Segmented } from '../ui/Toolbar';

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
  const { t } = useTranslation();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES, defaults: { range: DEFAULT_PRESET, view: 'list' } });
  const { page } = list;
  const pageSize = list.pageSize === 'all' ? 500 : list.pageSize;
  const startDateParam = list.get('startDate');
  const endDateParam = list.get('endDate');
  const qParam = list.q;
  const rangeParam = list.get('range');
  const view = list.oneOf('view', ['list', 'chart'] as const);

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

  const setView = (nextView: 'list' | 'chart') => list.set({ view: nextView }, { replace: true, keepPage: true });

  const selectPreset = (id: RangePresetId) => {
    setCustomOpen(false);
    list.set({ startDate: null, endDate: null, range: id });
  };

  const openCustomRange = () => {
    setCustomOpen(true);
    if (hasCustomDates) return;
    // Seed the inputs with whatever is on screen so the switch isn't a reset.
    const seed = range.from ?? lastNDaysRange(30).from;
    list.set({ startDate: toDateInput(seed), endDate: toDateInput(range.to), range: null });
  };

  /** Applies a custom bound immediately; an inverted range is swapped, not rejected. */
  const setCustomBound = (bound: 'start' | 'end', value: string) => {
    let nextStart = bound === 'start' ? value : startDateParam;
    let nextEnd = bound === 'end' ? value : endDateParam;
    if (nextStart && nextEnd && nextStart > nextEnd) [nextStart, nextEnd] = [nextEnd, nextStart];
    setCustomOpen(true);
    list.set({ startDate: nextStart, endDate: nextEnd, range: null });
  };

  // The chart pulls its own aggregates, so the list is only loaded while it is shown.
  const history = useAsyncData(() => fetchCampaignHistory(page, pageSize, range.apiStart, range.apiEnd, qParam, new Date().getTimezoneOffset()), [page, pageSize, range.apiStart, range.apiEnd, qParam], {
    enabled: view === 'list',
    // Posts published or edited elsewhere (another tab, an MCP agent, the scheduler).
    live: (event) => event.resource === 'post' || event.resource === 'campaign',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = history.data?.items ?? [];
  const total = history.data?.total ?? 0;

  const clearFilters = () => {
    setCustomOpen(false);
    list.set({ startDate: null, endDate: null, range: null, q: null });
  };

  const hasActiveFilters = hasCustomDates || Boolean(qParam) || rangeParam !== DEFAULT_PRESET;

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


  const rangeChips = (
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
                {t('v2.campaigns.history.to')}
              </Text>
              <TextField variant="outlined" type="date" aria-label={t('postingTrend.rangeEnd')} value={endDateParam} min={startDateParam || undefined} onValueChange={(v) => setCustomBound('end', v)} />
            </span>
          )}
        </div>
  );

  return (
    <Page density="compact">
      <PageHeader
        title={t('v2.campaigns.history.title')}
        description={t('v2.campaigns.history.description')}
        backLink={{ to: '/campaigns', label: t('v2.campaigns.backToCampaigns') }}
        actions={
          <Segmented<'list' | 'chart'>
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: t('postingTrend.listView'), icon: 'list' },
              { value: 'chart', label: t('postingTrend.chartView'), icon: 'show_chart' },
            ]}
          />
        }
      />
      {view === 'chart' ? (
        <div className="flex flex-col gap-3">
          {rangeChips}
          <Section variant="card">
            <PostingTrendChart from={range.from} to={range.to} height={280} />
          </Section>
        </div>
      ) : (
        <ListPane
          label={t('v2.campaigns.history.title')}
          lead={<ListTitle title={t('v2.campaigns.history.title')} icon="history" count={total} />}
          tools={<ListSearch value={qParam} onChange={list.setQuery} label={t('v2.campaigns.history.search')} />}
          below={rangeChips}
          loading={history.loading}
          refreshing={history.refreshing}
          error={history.error ? errorText(history.error, t('v2.campaigns.history.loadFailed')) : null}
          onRetry={() => void history.reload()}
          count={items.length}
          filtered={hasActiveFilters}
          onClearFilters={clearFilters}
          empty={{ icon: 'history', shape: 'clover-4', title: t('v2.campaigns.history.empty'), description: t('v2.campaigns.history.emptyHint') }}
          paging={{ page, pageSize: list.pageSize, total, pages: history.data?.totalPages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        >
          <RowList className="v2-list-pane__grid">
            {items.map((post) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const execution = post.executions?.find((ex: any) => ex.externalUrl) || post.executions?.[0];
              const account = execution?.socialAccount;
              const platform = account?.platform || '';
              const externalUrl = execution?.externalUrl || fallbackExternalUrl(platform, execution?.externalId);
              const updated = new Date(post.updatedAt);
              return (
                <Row
                  key={post.id}
                  lead={<AccountAvatar account={account} seed={post.id} size={36} refreshOn={['twitter', 'x', 'threads']} />}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {account?.profileName || t('v2.campaigns.unknownAccount')}
                      <StatusPill tone={post.status === 'completed' ? 'success' : 'error'}>{post.status === 'completed' ? t('v2.campaigns.published') : t('v2.campaigns.failed')}</StatusPill>
                    </span>
                  }
                  meta={
                    <>
                      <span className="uppercase">{platform}</span>
                      <span>·</span>
                      <Link to={`/campaigns/${post.campaign?.id}`} className="v2-link">
                        {post.campaign?.name || t('v2.campaigns.history.unknownCampaign')}
                      </Link>
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
                      {externalUrl && <IconButton icon="open_in_new" size="xs" label={t('v2.campaigns.viewLivePost')} tooltip href={externalUrl} target="_blank" rel="noopener noreferrer" />}
                      <IconButton icon="arrow_forward" size="xs" label={t('v2.campaigns.history.manage')} tooltip href={`/campaigns/${post.campaign?.id}/posts/edit/${post.id}`} />
                    </>
                  }
                />
              );
            })}
          </RowList>
        </ListPane>
      )}
    </Page>
  );
}
