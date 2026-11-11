import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { deleteCampaign, fetchCampaignsPage, fetchRecentPosts, fetchScheduledPosts, updateCampaign } from '../../api';
import { formatShortDate, formatTimeOrDate } from '../../lib/date';
import type { LiveResourceEvent } from '../../lib/live';
import { Button, Icon, IconButton, LinearProgress, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PostingTrendChart, lastNDaysRange } from '../components/campaigns/PostingTrendChart';
import { fallbackExternalUrl } from '../lib/platform';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { CARD_PAGE_SIZES, useListParams } from '../lib/useListParams';
import { useViewPref } from '../lib/viewPrefs';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList, EntityRow } from '../ui/EntityList';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { MediaCard } from '../ui/MediaCard';
import { EmptyState, Page, Section } from '../ui/Page';
import { PageHero } from '../ui/PageHero';
import { StatusPill } from '../ui/Stat';
import { CardGrid, LayoutToggle, LIST_LAYOUTS, MobileFab, type ListLayout } from '../ui/Toolbar';

type CampaignStatus = 'Active' | 'Inactive';

interface CampaignCardModel {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  status: CampaignStatus;
  /** Date and year only; the campaign page has the time of day. Null when nothing is scheduled. */
  startDate: string | null;
  endDate: string | null;
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
    description: raw.description || null,
    createdAt: raw.createdAt,
    status: raw.status === 'active' ? 'Active' : 'Inactive',
    startDate: start ? formatShortDate(start, true) : null,
    endDate: end ? formatShortDate(end, true) : null,
    totalPosts,
    postedPosts,
    thumbnail: withMedia ? withMedia.media[0].thumbnailUrl || withMedia.media[0].url || null : null,
  };
}

/** Campaigns with their progress, plus the posting trend, recent posts and the upcoming queue. */
export function Campaigns() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const action = useAction();
  const list = useListParams({ pageSize: 24, pageSizes: CARD_PAGE_SIZES });
  const size = list.pageSize === 'all' ? 24 : list.pageSize;
  const [deleteTarget, setDeleteTarget] = useState<CampaignCardModel | null>(null);
  const [layout, setLayout] = useViewPref<ListLayout>('v2.campaigns.layout', 'cards', LIST_LAYOUTS);
  const trendRange = useMemo(() => lastNDaysRange(7), []);

  // Campaigns and posts also change elsewhere: another tab, an MCP agent, the scheduler.
  const live = (event: LiveResourceEvent) => event.resource === 'campaign' || event.resource === 'post';
  const campaigns = useAsyncData(
    async () => {
      const data = await fetchCampaignsPage({ page: list.page, pageSize: size, q: list.q || undefined });
      return { items: data.items.map(mapCampaign), total: data.total, pages: data.totalPages };
    },
    [list.page, size, list.q],
    { live },
  );
  const items = campaigns.data?.items ?? [];
  const total = campaigns.data?.total ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent = useAsyncData<any[]>(() => fetchRecentPosts(10), [], { live });
  const scheduled = useAsyncData(() => fetchScheduledPosts(1, 5), [], { live });
  const recentPosts = recent.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scheduledPosts: any[] = scheduled.data?.items ?? [];
  const scheduledTotal = scheduled.data?.total ?? 0;

  const toggleStatus = (campaign: CampaignCardModel) => {
    const next = campaign.status === 'Active' ? 'archived' : 'active';
    void action.run(
      async () => {
        await updateCampaign(campaign.id, { status: next });
        campaigns.setData((data) => data && { ...data, items: data.items.map((c) => (c.id === campaign.id ? { ...c, status: next === 'active' ? 'Active' : 'Inactive' } : c)) });
      },
      { key: campaign.id, success: next === 'active' ? t('v2.campaigns.resumed') : t('v2.campaigns.paused'), error: t('v2.campaigns.updateFailed') },
    );
  };

  const campaignMenu = (c: CampaignCardModel): ActionMenuItem[] => [
    { key: 'edit', label: t('menu.edit'), icon: 'edit', href: `/campaigns/edit/${c.id}` },
    { key: 'status', label: c.status === 'Active' ? t('menu.pause') : t('menu.resume'), icon: c.status === 'Active' ? 'pause' : 'play_arrow', disabled: action.isBusy(c.id), onSelect: () => toggleStatus(c) },
    { key: 'delete', label: t('menu.delete'), icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteTarget(c) },
  ];

  const describe = (c: CampaignCardModel) => c.description ?? t('v2.campaigns.createdOn', { date: new Date(c.createdAt).toLocaleDateString() });
  const postsLabel = (c: CampaignCardModel) => (c.totalPosts > 0 ? t('v2.campaigns.postsProgress', { done: Math.min(c.postedPosts, c.totalPosts), total: c.totalPosts }) : t('status.setup'));
  const dateOf = (value: string | null) => value ?? t('v2.campaigns.notScheduled');

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
            <Button variant="filled" icon="add" emphasized href="/campaigns/new" className="v2-hide-mobile">
              {t('v2.campaigns.newCampaign')}
            </Button>
            <Button variant="tonal" icon="share" href="/campaigns/channels">
              {t('channels')}
            </Button>
          </>
        }
      />
      <div className="v2-campaigns">
        <ListPane
          variant="flush"
          label={t('allCampaigns')}
          lead={<ListTitle title={t('allCampaigns')} icon="campaign" count={total} />}
          tools={
            <>
              <ListSearch value={list.q} onChange={list.setQuery} label={t('searchPlaceholder')} />
              <LayoutToggle value={layout} onChange={setLayout} />
            </>
          }
          loading={campaigns.loading}
          refreshing={campaigns.refreshing}
          error={campaigns.error}
          onRetry={() => void campaigns.reload()}
          count={items.length}
          filtered={list.filtered}
          onClearFilters={list.clearFilters}
          empty={{
            icon: 'campaign',
            shape: 'burst',
            title: t('noCampaigns'),
            action: (
              <Button variant="filled" icon="add" href="/campaigns/new">
                {t('createOne')}
              </Button>
            ),
          }}
          paging={{ page: list.page, pageSize: size, total, pages: campaigns.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: CARD_PAGE_SIZES }}
        >
          {layout === 'cards' ? (
            <CardGrid min={300}>
              {items.map((c) => {
                const done = Math.min(c.postedPosts, c.totalPosts);
                return (
                  <MediaCard
                    key={c.id}
                    href={`/campaigns/${c.id}`}
                    image={c.thumbnail}
                    seed={c.id}
                    height={320}
                    badge={<StatusPill tone={c.status === 'Active' ? 'success' : 'neutral'}>{c.status === 'Active' ? t('status.active') : t('status.paused')}</StatusPill>}
                    kicker={postsLabel(c)}
                    title={c.name}
                    description={describe(c)}
                    meta={
                      <div className="flex w-full flex-col gap-2">
                        {c.totalPosts > 0 && <LinearProgress value={done / c.totalPosts} max={1} aria-label={postsLabel(c)} />}
                        <div className="v2-campaign-dates">
                          <span>
                            <Text as="span" variant="label-small" className="block uppercase tracking-widest opacity-70">
                              {t('v2.campaigns.start')}
                            </Text>
                            {dateOf(c.startDate)}
                          </span>
                          <span>
                            <Text as="span" variant="label-small" className="block uppercase tracking-widest opacity-70">
                              {t('v2.campaigns.end')}
                            </Text>
                            {dateOf(c.endDate)}
                          </span>
                        </div>
                      </div>
                    }
                    actions={<ActionMenu label={t('v2.common.more')} variant="tonal" items={campaignMenu(c)} />}
                  />
                );
              })}
            </CardGrid>
          ) : (
            <div className="v2-erow-surface">
              <EntityList>
                {items.map((c) => {
                  const done = Math.min(c.postedPosts, c.totalPosts);
                  const active = c.status === 'Active';
                  return (
                    <EntityRow
                      key={c.id}
                      lead={() =>
                        c.thumbnail ? (
                          <span className="v2-erow-thumb">
                            <img src={c.thumbnail} alt="" loading="lazy" decoding="async" />
                          </span>
                        ) : (
                          <span className="v2-erow-thumb v2-erow-thumb--empty">
                            <Icon name="campaign" size={22} aria-hidden />
                          </span>
                        )
                      }
                      title={c.name}
                      badges={<StatusPill tone={active ? 'success' : 'neutral'}>{active ? t('status.active') : t('status.paused')}</StatusPill>}
                      subtitle={describe(c)}
                      cells={[
                        {
                          key: 'posts',
                          width: '150px',
                          narrow: 'below',
                          children: (
                            <span className="v2-campaign-progress">
                              <Text as="span" variant="label-medium">
                                {postsLabel(c)}
                              </Text>
                              {c.totalPosts > 0 && <LinearProgress value={done / c.totalPosts} max={1} aria-label={postsLabel(c)} />}
                            </span>
                          ),
                        },
                        {
                          key: 'dates',
                          width: '200px',
                          shrink: true,
                          narrow: 'below',
                          children: (
                            <span className="v2-erow__value">
                              <Icon name="event" size={16} aria-hidden />
                              <span className="truncate">{c.startDate === c.endDate ? dateOf(c.startDate) : `${dateOf(c.startDate)} – ${dateOf(c.endDate)}`}</span>
                            </span>
                          ),
                        },
                      ]}
                      onOpen={() => navigate(`/campaigns/${c.id}`)}
                      ariaLabel={c.name}
                      menuLabel={t('v2.common.more')}
                      menuItems={campaignMenu(c)}
                    />
                  );
                })}
              </EntityList>
            </div>
          )}
        </ListPane>

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
            {recent.loading ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="v2-skeleton mb-2" style={{ height: 48 }} />)
            ) : recentPosts.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                {t('v2.campaigns.noRecentActivity')}
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
                          {account?.profileName || t('v2.campaigns.unknownAccount')}
                        </Link>
                        <StatusPill tone={post.status === 'completed' ? 'success' : 'error'}>{post.status === 'completed' ? t('v2.campaigns.published') : t('v2.campaigns.failed')}</StatusPill>
                      </span>
                      <Text as="span" variant="label-small" className="flex min-w-0 items-center gap-1 text-on-surface-variant">
                        <Link to={`/campaigns/${campaignIdOf(post)}`} className="truncate hover:underline">
                          {post.campaign?.name}
                        </Link>
                        · <Icon name="schedule" size={12} /> {formatTimeOrDate(new Date(post.updatedAt))}
                      </Text>
                    </div>
                    {externalUrl && <IconButton icon="open_in_new" size="xs" label={t('v2.campaigns.viewLivePost')} tooltip href={externalUrl} target="_blank" rel="noopener noreferrer" />}
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
                {scheduledPosts.length > 0 ? t('viewAllScheduled') : t('openCalendar')}
              </Button>
            }
          >
            {scheduled.loading ? (
              Array.from({ length: 3 }).map((_, i) => <div key={i} className="v2-skeleton mb-2" style={{ height: 48 }} />)
            ) : scheduledPosts.length === 0 ? (
              <EmptyState icon="schedule" size="inline" title={t('upcomingQueue')} description={t('v2.campaigns.noScheduledHint')} />
            ) : (
              scheduledPosts.map((post) => {
                const link = `/campaigns/${campaignIdOf(post)}/posts/edit/${post.id}`;
                return (
                  <Link key={post.id} to={link} className="v2-feed-row m3-focus-ring">
                    <span className="v2-feed-thumb">{post.media?.[0]?.thumbnailUrl ? <img src={post.media[0].thumbnailUrl} alt="" /> : <Icon name="event" />}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Text as="span" variant="body-small" className="line-clamp-1">
                        {post.textContent || <em className="text-on-surface-variant">{t('v2.campaigns.noTextContent')}</em>}
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
      <MobileFab icon="add" label={t('v2.campaigns.newCampaign')} href="/campaigns/new" />
      <ConfirmDialog
        open={!!deleteTarget}
        tone="danger"
        title={t('deleteDialog.title')}
        message={t('deleteDialog.description', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('deleteDialog.confirm')}
        cancelLabel={t('deleteDialog.cancel')}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await action.run(
            async () => {
              await deleteCampaign(deleteTarget.id);
              // Deleting the only card on the last page would leave it empty; step back instead.
              if (items.length === 1 && list.page > 1) list.setPage(list.page - 1);
              else await campaigns.reload(true);
            },
            { key: `delete:${deleteTarget.id}`, success: t('v2.campaigns.deleted'), error: t('v2.campaigns.deleteFailed'), rethrow: true },
          );
        }}
      />
    </Page>
  );
}
