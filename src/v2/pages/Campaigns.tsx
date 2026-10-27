import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { deleteCampaign, fetchCampaignsPage, fetchRecentPosts, fetchScheduledPosts, updateCampaign } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { formatShortDate, formatTimeOrDate } from '../../lib/date';
import { Button, Icon, IconButton, LinearProgress, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PostingTrendChart, lastNDaysRange } from '../components/campaigns/PostingTrendChart';
import { fallbackExternalUrl } from '../lib/platform';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { MediaCard } from '../ui/MediaCard';
import { EmptyState, Page, Section } from '../ui/Page';
import { PageHero } from '../ui/PageHero';
import { Pagination } from '../ui/Pagination';
import { SearchField } from '../ui/SearchField';
import { StatusPill } from '../ui/Stat';
import { CardGrid, ListToolbar, MobileFab } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

type CampaignStatus = 'Active' | 'Inactive';

interface CampaignCardModel {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  totalPosts: number;
  postedPosts: number;
  thumbnail: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCampaign(raw: any): CampaignCardModel {
  const posts = Array.isArray(raw.posts) ? raw.posts : [];
  const totalPosts = raw._count?.posts ?? posts.length ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const postedPosts = raw.completedPostsCount ?? posts.filter((post: any) => post.status === 'completed' || post.status === 'posted').length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const times = posts.map((post: any) => (post.scheduledAt ? new Date(post.scheduledAt).getTime() : Number.NaN)).filter(Number.isFinite);
  const start = raw.scheduledStart ? new Date(raw.scheduledStart) : times.length > 0 ? new Date(Math.min(...times)) : null;
  const end = raw.scheduledEnd ? new Date(raw.scheduledEnd) : times.length > 0 ? new Date(Math.max(...times)) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withMedia = posts.find((p: any) => p.media && p.media.length > 0);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || `Campaign created on ${new Date(raw.createdAt).toLocaleDateString()}`,
    status: raw.status === 'active' ? 'Active' : 'Inactive',
    // Cards carry the date and year only; the campaign page has the time of day.
    startDate: start ? formatShortDate(start, true) : 'Not scheduled',
    endDate: end ? formatShortDate(end, true) : 'Not scheduled',
    totalPosts,
    postedPosts,
    thumbnail: withMedia ? withMedia.media[0].thumbnailUrl || withMedia.media[0].url || null : null,
  };
}

/** Campaigns with their progress, plus the posting trend, recent posts and the upcoming queue. */
export function Campaigns() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '12', 10) || 12));
  const [campaigns, setCampaigns] = useState<CampaignCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CampaignCardModel | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [scheduledLoading, setScheduledLoading] = useState(true);
  const trendRange = useMemo(() => lastNDaysRange(7), []);
  // Only the newest load may write the list.
  const loadSeq = useRef(0);

  const loadData = async (silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    try {
      const data = await fetchCampaignsPage({ page, pageSize, q: queryParam || undefined });
      if (seq !== loadSeq.current) return;
      setCampaigns(data.items.map(mapCampaign));
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      if (silent) console.error('Failed to refresh campaigns', error);
      else toast.error('Failed to load campaigns');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };
  const loadRecent = async (silent = false) => {
    if (!silent) setRecentLoading(true);
    try {
      setRecentPosts(await fetchRecentPosts(10));
    } catch (error) {
      console.error('Failed to load recent posts', error);
    } finally {
      setRecentLoading(false);
    }
  };
  const loadScheduled = async (silent = false) => {
    if (!silent) setScheduledLoading(true);
    try {
      const data = await fetchScheduledPosts(1, 5);
      setScheduled(data.items);
      setScheduledTotal(data.total);
    } catch (error) {
      console.error('Failed to load scheduled posts', error);
    } finally {
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    void loadRecent();
    void loadScheduled();
  }, []);
  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, queryParam]);
  // Campaigns and posts changed elsewhere (another tab, an MCP agent, the scheduler).
  useLiveRefresh(
    (event) => event.resource === 'campaign' || event.resource === 'post',
    () => Promise.all([loadData(true), loadRecent(true), loadScheduled(true)]),
  );

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === queryParam) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      // A new search starts over.
      params.delete('page');
      setSearchParams(params, { replace: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, queryParam, searchParams, setSearchParams]);

  const setPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    setSearchParams(params);
  };

  const toggleStatus = async (campaign: CampaignCardModel) => {
    const next = campaign.status === 'Active' ? 'archived' : 'active';
    try {
      await updateCampaign(campaign.id, { status: next });
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, status: next === 'active' ? 'Active' : 'Inactive' } : c)));
      toast.success(next === 'active' ? 'Campaign resumed' : 'Campaign paused');
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to update campaign');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignIdOf = (post: any) => post.campaignId || post.campaign?.id;

  return (
    <Page>
      <PageHero
        icon="send"
        shape="burst"
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="filled" icon="add" emphasized href="/campaigns/new" className="v2-hide-compact">
              New Campaign
            </Button>
            <Button variant="tonal" icon="share" href="/campaigns/channels">
              {t('channels')}
            </Button>
          </>
        }
      />
      <div className="v2-campaigns">
        <section className="flex min-w-0 flex-col gap-3">
          <ListToolbar title={t('allCampaigns')} icon="campaign" count={total}>
            <SearchField value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
          </ListToolbar>
          {loading ? (
            <CardGrid min={300}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="v2-skeleton" style={{ height: 300 }} />
              ))}
            </CardGrid>
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon="campaign"
              shape="burst"
              title={t('noCampaigns')}
              action={
                !queryParam && (
                  <Button variant="filled" icon="add" onClick={() => navigate('/campaigns/new')}>
                    {t('createOne')}
                  </Button>
                )
              }
            />
          ) : (
            <CardGrid min={300}>
              {campaigns.map((c) => {
                const done = Math.min(c.postedPosts, c.totalPosts);
                const progress = c.totalPosts > 0 ? done / c.totalPosts : 0;
                return (
                  <MediaCard
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    image={c.thumbnail}
                    seed={c.id}
                    height={320}
                    badge={<StatusPill tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status === 'Active' ? t('status.active') : t('status.paused')}</StatusPill>}
                    kicker={c.totalPosts > 0 ? `${done}/${c.totalPosts} posts` : t('status.setup')}
                    title={c.name}
                    description={c.description}
                    meta={
                      <div className="flex w-full flex-col gap-2">
                        {c.totalPosts > 0 && <LinearProgress value={progress} max={1} aria-label={`${done}/${c.totalPosts}`} />}
                        <div className="v2-campaign-dates">
                          <span>
                            <Text as="span" variant="label-small" className="block uppercase tracking-widest opacity-70">
                              Start
                            </Text>
                            {c.startDate}
                          </span>
                          <span>
                            <Text as="span" variant="label-small" className="block uppercase tracking-widest opacity-70">
                              End
                            </Text>
                            {c.endDate}
                          </span>
                        </div>
                      </div>
                    }
                    actions={
                      <ActionMenu
                        label={t('v2.common.more')}
                        variant="tonal"
                        items={[
                          { key: 'edit', label: t('menu.edit'), icon: 'edit', href: `/campaigns/edit/${c.id}` },
                          { key: 'status', label: c.status === 'Active' ? t('menu.pause') : t('menu.resume'), icon: c.status === 'Active' ? 'pause' : 'play_arrow', onSelect: () => void toggleStatus(c) },
                          { key: 'delete', label: t('menu.delete'), icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteTarget(c) },
                        ]}
                      />
                    }
                  />
                );
              })}
            </CardGrid>
          )}
          {!loading && totalPages > 1 && (
            <div className="v2-paged-footer">
              <Text variant="label-medium" className="text-on-surface-variant">
                {t('pagination.range', { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, total), total })}
              </Text>
              <Pagination page={page} pages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </section>

        <aside className="v2-campaigns__aside" data-density="compact">
          <Section variant="card" icon="trending_up" title={t('postingTrend.title')}>
            <PostingTrendChart from={trendRange.from} to={trendRange.to} />
          </Section>

          <Section
            variant="card"
            icon="history"
            title={t('recentlyPosted')}
            actions={
              recentPosts.length > 0 && (
                <Button variant="text" size="xs" trailingIcon="arrow_forward" href="/campaigns/history">
                  {t('viewAllHistory')}
                </Button>
              )
            }
          >
            {recentLoading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="v2-skeleton mb-2" style={{ height: 48 }} />)
            ) : recentPosts.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                No recent activity found.
              </Text>
            ) : (
              recentPosts.map((post) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const execution = post.executions?.find((ex: any) => ex.externalUrl) || post.executions?.[0];
                const account = execution?.socialAccount;
                const externalUrl = execution?.externalUrl || fallbackExternalUrl(account?.platform, execution?.externalId);
                const postLink = `/campaigns/${campaignIdOf(post)}/posts/edit/${post.id}`;
                return (
                  <div key={post.id} className="v2-feed-row">
                    <Link to={postLink}>
                      <AccountAvatar account={account} seed={post.id} size={36} />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex min-w-0 items-center gap-2">
                        <Link to={postLink} className="v2-link truncate">
                          {account?.profileName || 'Unknown Account'}
                        </Link>
                        <StatusPill tone={post.status === 'completed' ? 'success' : 'error'}>{post.status === 'completed' ? 'Published' : 'Failed'}</StatusPill>
                      </span>
                      <Text as="span" variant="label-small" className="flex min-w-0 items-center gap-1 text-on-surface-variant">
                        <Link to={`/campaigns/${campaignIdOf(post)}`} className="truncate hover:underline">
                          {post.campaign?.name}
                        </Link>
                        · <Icon name="schedule" size={12} /> {formatTimeOrDate(new Date(post.updatedAt))}
                      </Text>
                    </div>
                    {externalUrl && <IconButton icon="open_in_new" size="xs" label="View live post" tooltip href={externalUrl} target="_blank" rel="noopener noreferrer" />}
                  </div>
                );
              })
            )}
          </Section>

          <Section
            variant="card"
            icon="event"
            title={
              <>
                {t('scheduledPosts')} {scheduledTotal > 0 && <span className="v2-count">{scheduledTotal}</span>}
              </>
            }
            actions={
              <Button variant="text" size="xs" trailingIcon="arrow_forward" href="/campaigns/scheduled">
                {scheduled.length > 0 ? t('viewAllScheduled') : t('openCalendar')}
              </Button>
            }
          >
            {scheduledLoading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="v2-skeleton mb-2" style={{ height: 48 }} />)
            ) : scheduled.length === 0 ? (
              <EmptyState icon="schedule" size="inline" title={t('upcomingQueue')} description="No scheduled posts found. Start planning your campaigns!" />
            ) : (
              scheduled.map((post) => {
                const link = `/campaigns/${campaignIdOf(post)}/posts/edit/${post.id}`;
                return (
                  <Link key={post.id} to={link} className="v2-feed-row m3-focus-ring">
                    <span className="v2-feed-thumb">{post.media?.[0]?.thumbnailUrl ? <img src={post.media[0].thumbnailUrl} alt="" /> : <Icon name="event" />}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Text as="span" variant="body-small" className="line-clamp-1">
                        {post.textContent || <em className="text-on-surface-variant">No text content</em>}
                      </Text>
                      <Text as="span" variant="label-small" className="truncate text-on-surface-variant">
                        {formatShortDate(new Date(post.scheduledAt))} · {post.campaign?.name}
                      </Text>
                    </span>
                    <Icon name="arrow_forward" size={18} className="text-on-surface-variant" />
                  </Link>
                );
              })
            )}
          </Section>
        </aside>
      </div>
      <MobileFab icon="add" label="New Campaign" href="/campaigns/new" />
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('deleteDialog.title')}
        message={t('deleteDialog.description', { name: deleteTarget?.name || 'this campaign' })}
        confirmLabel={t('deleteDialog.confirm')}
        cancelLabel={t('deleteDialog.cancel')}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteCampaign(deleteTarget.id);
            toast.success('Campaign deleted');
            // Deleting the only card on the last page would leave it empty; step back instead.
            if (campaigns.length === 1 && page > 1) setPage(page - 1);
            else await loadData();
          } catch (error) {
            toast.error((error as Error)?.message || 'Failed to delete campaign');
            throw error;
          }
        }}
      />
    </Page>
  );
}
