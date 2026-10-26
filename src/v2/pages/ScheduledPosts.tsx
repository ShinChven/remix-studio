import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchScheduledPostCounts, fetchScheduledPosts } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { formatShortDate } from '../../lib/date';
import { Button, cx, Icon, IconButton, Text } from '../../m3';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { Row, RowList } from '../ui/Rows';
import { SearchField } from '../ui/SearchField';
import { Segmented } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

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
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const viewMode = (searchParams.get('view') as ViewMode) || 'list';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const q = searchParams.get('q') || '';
  
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [counts, setCounts] = useState<PostCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalScheduled, setTotalScheduled] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState(q);

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const loadPosts = async (silent = false) => {
    if (viewMode === 'calendar') return;
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchScheduledPosts(page, 25, q);
      setPosts(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      // Without a search filter the list total is already the overall total.
      if (!q) setTotalScheduled(data.total);
    } catch (error) {
      console.error('[ScheduledPosts] loadPosts error:', error);
      toast.error((error as Error).message || 'Failed to load scheduled posts');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCounts = async (silent = false) => {
    if (viewMode === 'list') return;
    if (!silent) setIsLoading(true);
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      
      // Expand to cover full weeks
      const from = new Date(startOfMonth);
      from.setDate(from.getDate() - from.getDay());
      from.setHours(0, 0, 0, 0);
      const to = new Date(endOfMonth);
      to.setDate(to.getDate() + (6 - to.getDay()));
      to.setHours(23, 59, 59, 999);

      const data = await fetchScheduledPostCounts(
        from.toISOString(),
        to.toISOString(),
        new Date().getTimezoneOffset()
      );
      setCounts(data);
    } catch (error) {
      console.error('[ScheduledPosts] loadCounts error:', error);
      toast.error((error as Error).message || 'Failed to load post counts');
    } finally {
      setIsLoading(false);
    }
  };

  // Total across every scheduled post, independent of the search filter or the calendar month.
  const loadTotalScheduled = async () => {
    try {
      const data = await fetchScheduledPosts(1, 1);
      setTotalScheduled(data.total);
    } catch (error) {
      console.error('[ScheduledPosts] loadTotalScheduled error:', error);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      void loadPosts();
    } else {
      void loadCounts();
    }
  }, [viewMode, page, q, currentMonth]);

  useEffect(() => {
    // In list view without a search, loadPosts already reports the overall total.
    if (viewMode === 'list' && !q) return;
    void loadTotalScheduled();
  }, [viewMode, q]);

  // Posts scheduled, rescheduled or published elsewhere (another tab, an MCP
  // agent, the scheduler); campaign names show on each row.
  useLiveRefresh(
    (event) => event.resource === 'post' || event.resource === 'campaign',
    () => Promise.all([
      viewMode === 'list' ? loadPosts(true) : loadCounts(true),
      viewMode === 'list' && !q ? undefined : loadTotalScheduled(),
    ]),
  );

  const toggleView = (mode: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', mode);
    if (mode === 'calendar') {
      params.delete('page');
      params.delete('q');
    }
    setSearchParams(params);
  };

  const applySearch = () => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (searchQuery) params.set('q', searchQuery);
    else params.delete('q');
    setSearchParams(params);
  };

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

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
            Scheduled Posts
            {totalScheduled !== null && <span className="v2-count">{totalScheduled} total</span>}
          </span>
        }
        description="View and manage your upcoming social media posts."
        backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
        actions={
          <Segmented<ViewMode>
            value={viewMode}
            onChange={toggleView}
            options={[
              { value: 'list', label: 'List', icon: 'list' },
              { value: 'calendar', label: 'Calendar', icon: 'calendar_month' },
            ]}
          />
        }
      />
      {viewMode === 'list' ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={searchQuery} onChange={setSearchQuery} onSubmit={() => applySearch()} placeholder="Search scheduled posts..." className="v2-header-search" />
            <Button variant="tonal" size="sm" icon="search" onClick={applySearch}>
              Search
            </Button>
            {!isLoading && total > 0 && (
              <Text variant="label-medium" className="ms-auto text-on-surface-variant">
                {`Showing ${(page - 1) * 25 + 1}–${(page - 1) * 25 + posts.length} of ${total}${q ? ' matching' : ''} ${total === 1 ? 'post' : 'posts'}`}
              </Text>
            )}
          </div>
          {isLoading ? (
            <LoadingState minHeight={200} />
          ) : posts.length === 0 ? (
            <EmptyState icon="schedule" shape="clover-4" title="No scheduled posts" description={q ? 'No results found for your search.' : 'Your scheduled posts will appear here.'} />
          ) : (
            <RowList>
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
                    title={post.textContent || <em className="text-on-surface-variant">No text content</em>}
                    meta={
                      <>
                        <Link to={`/campaigns/${cid}`} className="v2-link">
                          {post.campaign?.name || 'Unknown Campaign'}
                        </Link>
                        <span>·</span>
                        <span className="tabular-nums">
                          {formatShortDate(when)} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {post.media && post.media.length > 1 && <span className="v2-info-chip">{post.media.length} media</span>}
                      </>
                    }
                    actions={<IconButton icon="arrow_forward" size="xs" label="Open" href={`/campaigns/${cid}/posts/edit/${post.id}`} />}
                  />
                );
              })}
            </RowList>
          )}
          {totalPages > 1 && (
            <div className="v2-paged-footer">
              <Text variant="label-medium" className="text-on-surface-variant">
                Page {page} of {totalPages} · {total} {total === 1 ? 'post' : 'posts'}
              </Text>
              <Pagination page={page} pages={totalPages} onPageChange={updatePage} />
            </div>
          )}
        </div>
      ) : (
        <Section
          variant="card"
          title={currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          description={!isLoading ? `${monthTotal} ${monthTotal === 1 ? 'post' : 'posts'} this month${totalScheduled !== null ? ` · ${totalScheduled} total` : ''}` : undefined}
          actions={
            <>
              <IconButton icon="chevron_left" variant="tonal" label="Previous month" onClick={prevMonth} className="m3-mirror-rtl" />
              <Button variant="tonal" size="sm" onClick={() => setCurrentMonth(new Date())}>
                Today
              </Button>
              <IconButton icon="chevron_right" variant="tonal" label="Next month" onClick={nextMonth} className="m3-mirror-rtl" />
            </>
          }
        >
          <div className="v2-calendar">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="v2-calendar__weekday">
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const data = getPostCountForDate(day.date);
              const today = day.date.toDateString() === new Date().toDateString();
              return (
                <div key={i} className={cx('v2-calendar__day', !day.isCurrentMonth && 'v2-calendar__day--other')}>
                  <span className="v2-calendar__date" data-today={today ? '' : undefined}>
                    {day.date.getDate()}
                  </span>
                  {data && data.postCount > 0 && (
                    <span className="v2-calendar__count">
                      <span className="v2-pane-wide">Posts</span> {data.postCount}
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
