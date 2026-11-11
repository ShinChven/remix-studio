import { uiLocale } from '../lib/format';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchScheduledPostCounts, fetchScheduledPosts } from '../../api';
import type { LiveResourceEvent } from '../../lib/live';
import { Button, cx, Icon, IconButton } from '../../m3';
import { errorText } from '../lib/errors';
import { useAsyncData } from '../lib/useAsyncData';
import { PAGE_SIZES, useListParams } from '../lib/useListParams';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { ErrorState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { Segmented } from '../ui/Toolbar';

type ViewMode = 'list' | 'calendar';

interface ScheduledPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt: string;
  updatedAt: string;
  campaignId: string;
  campaign?: {
    id: string;
    name: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  media?: any[];
}

interface PostCount {
  date: string;
  postCount: number;
  sendCount: number;
}

function formatLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Upcoming posts as a searchable list or a month calendar of daily counts. */
export function ScheduledPosts() {
  const { t, i18n } = useTranslation();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES, defaults: { view: 'list' } });
  const { page, q } = list;
  const pageSize = list.pageSize === 'all' ? 500 : list.pageSize;
  const viewMode = list.oneOf('view', ['list', 'calendar'] as const);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Posts scheduled, rescheduled or published elsewhere (another tab, an MCP agent, the scheduler);
  // campaign names show on each row.
  const live = (event: LiveResourceEvent) => event.resource === 'post' || event.resource === 'campaign';
  const postsData = useAsyncData(() => fetchScheduledPosts(page, pageSize, q), [page, pageSize, q], { enabled: viewMode === 'list', live });
  const posts: ScheduledPost[] = postsData.data?.items ?? [];
  const total = postsData.data?.total ?? 0;

  const countsData = useAsyncData<PostCount[]>(
    () => {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      // Expand to cover full weeks.
      const from = new Date(startOfMonth);
      from.setDate(from.getDate() - from.getDay());
      from.setHours(0, 0, 0, 0);
      const to = new Date(endOfMonth);
      to.setDate(to.getDate() + (6 - to.getDay()));
      to.setHours(23, 59, 59, 999);
      return fetchScheduledPostCounts(from.toISOString(), to.toISOString(), new Date().getTimezoneOffset());
    },
    [currentMonth.getFullYear(), currentMonth.getMonth()],
    { enabled: viewMode === 'calendar', live },
  );
  const counts = countsData.data ?? [];

  // Total across every scheduled post, independent of the search or the calendar month. In the
  // list without a search, the list's own total is already that.
  const overall = useAsyncData(() => fetchScheduledPosts(1, 1), [], { enabled: viewMode === 'calendar' || q !== '', live });
  const totalScheduled = viewMode === 'list' && !q ? (postsData.data ? total : null) : (overall.data?.total ?? null);

  const toggleView = (mode: ViewMode) => list.set(mode === 'calendar' ? { view: mode, q: null } : { view: mode });

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  // Calendar rendering helpers
  const calendarDays = useMemo(() => {
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    
    const days = [];
    
    // Padding from previous month
    const prevMonthLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
    for (let i = startOfMonth.getDay(); i > 0; i--) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, prevMonthLastDay.getDate() - i + 1),
        isCurrentMonth: false
      });
    }
    
    // Days of current month
    for (let i = 1; i <= endOfMonth.getDate(); i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i),
        isCurrentMonth: true
      });
    }
    
    // Padding for next month
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  }, [currentMonth]);

  // Sunday-first, to match the grid.
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(uiLocale(), { weekday: 'short' })), [i18n.language]);

  const countsByDate = useMemo(() => new Map(counts.map((count) => [count.date, count])), [counts]);

  function getPostCountForDate(date: Date) {
    return countsByDate.get(formatLocalDateKey(date));
  }

  // The fetched range covers full weeks, so only count days belonging to the displayed month.
  const monthTotal = useMemo(
    () =>
      calendarDays.reduce(
        (sum, day) =>
          day.isCurrentMonth ? sum + (countsByDate.get(formatLocalDateKey(day.date))?.postCount || 0) : sum,
        0,
      ),
    [calendarDays, countsByDate],
  );

  return (
    <Page density="compact">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t('scheduledPosts')}
            {totalScheduled !== null && totalScheduled > 0 && <span className="v2-count">{t('v2.campaigns.scheduled.total', { count: totalScheduled })}</span>}
          </span>
        }
        description={t('v2.campaigns.scheduled.description')}
        backLink={{ to: '/campaigns', label: t('v2.campaigns.backToCampaigns') }}
        actions={
          <Segmented<ViewMode>
            value={viewMode}
            onChange={toggleView}
            options={[
              { value: 'list', label: t('postingTrend.listView'), icon: 'list' },
              { value: 'calendar', label: t('v2.campaigns.scheduled.calendar'), icon: 'calendar_month' },
            ]}
          />
        }
      />
      {viewMode === 'list' ? (
        <ListPane
          label={t('scheduledPosts')}
          lead={<ListTitle title={t('scheduledPosts')} icon="event" count={total} />}
          tools={<ListSearch value={q} onChange={list.setQuery} label={t('v2.campaigns.searchPosts')} />}
          loading={postsData.loading}
          refreshing={postsData.refreshing}
          error={postsData.error ? errorText(postsData.error, t('v2.campaigns.scheduled.loadFailed')) : null}
          onRetry={() => void postsData.reload()}
          count={posts.length}
          filtered={q !== ''}
          onClearFilters={() => list.setQuery('')}
          empty={{ icon: 'schedule', shape: 'clover-4', title: t('v2.campaigns.scheduled.empty'), description: t('v2.campaigns.scheduled.emptyHint') }}
          paging={{ page, pageSize: list.pageSize, total, pages: postsData.data?.totalPages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
        >
          <RowList className="v2-list-pane__grid">
              {posts.map((post) => {
                const cid = post.campaignId || post.campaign?.id;
                const when = new Date(post.scheduledAt);
                return (
                  <Row
                    key={post.id}
                    to={`/campaigns/${cid}/posts/edit/${post.id}`}
                    lead={
                      <span className="v2-feed-thumb">
                        {post.media?.[0]?.thumbnailUrl ? <img src={post.media[0].thumbnailUrl} alt="" /> : <Icon name={post.media?.length ? 'image' : 'schedule'} />}
                      </span>
                    }
                    title={post.textContent || <em className="text-on-surface-variant">{t('v2.campaigns.noTextContent')}</em>}
                    meta={
                      <>
                        <Link to={`/campaigns/${cid}`} className="v2-link">
                          {post.campaign?.name || t('v2.campaigns.history.unknownCampaign')}
                        </Link>
                        <span>·</span>
                        <span className="tabular-nums">
                          {when.toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric' })} {when.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {post.media && post.media.length > 1 && <span className="v2-info-chip">{t('v2.campaigns.scheduled.mediaCount', { count: post.media.length })}</span>}
                      </>
                    }
                    actions={<IconButton icon="arrow_forward" size="xs" label={t('v2.campaigns.scheduled.open')} href={`/campaigns/${cid}/posts/edit/${post.id}`} />}
                  />
                );
              })}
          </RowList>
        </ListPane>
      ) : (
        <Section
          variant="card"
          title={currentMonth.toLocaleDateString(uiLocale(), { month: 'long', year: 'numeric' })}
          description={countsData.data ? [t('v2.campaigns.scheduled.thisMonth', { count: monthTotal }), totalScheduled ? t('v2.campaigns.scheduled.total', { count: totalScheduled }) : ''].filter(Boolean).join(' · ') : undefined}
          actions={
            <>
              <IconButton icon="chevron_left" variant="tonal" label={t('v2.campaigns.scheduled.prevMonth')} onClick={prevMonth} className="m3-mirror-rtl" />
              <Button variant="tonal" size="sm" onClick={() => setCurrentMonth(new Date())}>
                {t('v2.campaigns.scheduled.today')}
              </Button>
              <IconButton icon="chevron_right" variant="tonal" label={t('v2.campaigns.scheduled.nextMonth')} onClick={nextMonth} className="m3-mirror-rtl" />
            </>
          }
        >
          {countsData.error && <ErrorState message={errorText(countsData.error, t('v2.campaigns.scheduled.loadFailed'))} onRetry={() => void countsData.reload()} retryLabel={t('v2.common.retry')} />}
          <div className="v2-calendar">
            {weekdays.map((d) => (
              <div key={d} className="v2-calendar__weekday">
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const data = getPostCountForDate(day.date);
              const today = day.date.toDateString() === new Date().toDateString();
              return (
                <div key={i} className={cx('v2-calendar__day', !day.isCurrentMonth && 'v2-calendar__day--other')} data-busy={data && data.postCount > 0 ? '' : undefined} title={data && data.postCount > 0 ? `${t('v2.campaigns.scheduled.postCount', { count: data.postCount })} · ${day.date.toLocaleDateString(uiLocale())}` : undefined}>
                  <span className="v2-calendar__date" data-today={today ? '' : undefined}>
                    {day.date.getDate()}
                  </span>
                  {data && data.postCount > 0 && (
                    <span className="v2-calendar__count">
                      <strong>{data.postCount}</strong>
                      <span className="v2-calendar__unit">{t('v2.campaigns.scheduled.postUnit', { count: data.postCount })}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </Page>
  );
}
