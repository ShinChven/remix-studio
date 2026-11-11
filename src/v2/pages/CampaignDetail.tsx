import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteCampaign, deletePost, fetchCampaign, fetchCampaignPosts, sendPostNow, updateCampaign } from '../../api';
import { formatShortDate } from '../../lib/date';
import type { LiveResourceEvent } from '../../lib/live';
import { Button, Icon, LinearProgress, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { PostCard, type PostCardMedia, type PostCardPost } from '../components/campaigns/PostCard';
import { PostMediaViewer } from '../components/campaigns/PostMediaViewer';
import { useAiTextTask } from '../components/campaigns/useAiTextTask';
import { errorText } from '../lib/errors';
import { formatBytes } from '../lib/format';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useListParams, type PageSize } from '../lib/useListParams';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import { SortMenu } from '../ui/SortMenu';
import { StatusPill } from '../ui/Stat';
import { MobileFab } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

export type PostStatusFilter = 'all' | 'draft' | 'scheduled' | 'queued' | 'completed' | 'failed';
export type PostSortKey = 'scheduled_asc' | 'scheduled_desc' | 'created_desc' | 'created_asc';

export const POST_STATUS_FILTERS: readonly PostStatusFilter[] = ['all', 'draft', 'scheduled', 'queued', 'completed', 'failed'];
export const POST_STATUS_ICONS: Record<PostStatusFilter, string> = { all: 'apps', draft: 'edit_note', scheduled: 'event', queued: 'hourglass_top', completed: 'check_circle', failed: 'error' };
export const POST_SORT_KEYS: readonly PostSortKey[] = ['scheduled_asc', 'scheduled_desc', 'created_desc', 'created_asc'];
export const POST_SORT_ICONS: Record<PostSortKey, string> = { scheduled_asc: 'event_upcoming', scheduled_desc: 'event_repeat', created_desc: 'south', created_asc: 'north' };
const PAGE_SIZES: readonly PageSize[] = [25, 50, 100];
const EMPTY_COUNTS: Record<PostStatusFilter, number> = { all: 0, draft: 0, scheduled: 0, queued: 0, completed: 0, failed: 0 };

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
}

type PostMedia = PostCardMedia & { status?: string };

interface CampaignPost extends PostCardPost {
  media?: PostMedia[];
  executions?: Array<{ id: string; status: string; externalUrl?: string | null; socialAccount?: SocialAccount }>;
}

const displayAccountName = (account: SocialAccount) => account.profileName || account.accountId || account.platform;

/** The span of scheduled posts, or nothing when none is scheduled. */
function formatSchedule(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  const first = formatShortDate(start, true);
  const last = formatShortDate(end, true);
  return first === last ? first : `${first} – ${last}`;
}

/** One campaign: its progress, channels and posts, with sending, scheduling and AI text. */
export function CampaignDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const action = useAction();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES, defaults: { status: 'all', sort: 'scheduled_asc' } });
  const { q, page } = list;
  const pageSize = list.pageSize === 'all' ? 25 : list.pageSize;
  const statusFilter = list.oneOf('status', POST_STATUS_FILTERS);
  const sortKey = list.oneOf('sort', POST_SORT_KEYS);

  const [sendTarget, setSendTarget] = useState<CampaignPost | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<CampaignPost | null>(null);
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [aiPostId, setAiPostId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ media: PostMedia[]; index: number } | null>(null);

  // The campaign or its posts changed elsewhere; batch post changes name no campaign, so they match too.
  const live = (event: LiveResourceEvent) => (event.resource === 'campaign' ? event.id === id : event.resource === 'post' && (!event.campaignId || event.campaignId === id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignData = useAsyncData<any>(() => fetchCampaign(id!, false), [id], { enabled: !!id, live });
  const campaign = campaignData.data;
  const postsData = useAsyncData(() => fetchCampaignPosts(id!, { page, pageSize, q, status: statusFilter, sort: sortKey }), [id, page, pageSize, q, statusFilter, sortKey], {
    enabled: !!id,
    live,
    // A page past the end, e.g. after deleting its last post, steps back to the last one.
    onLoaded: (data) => {
      const pages = Math.max(1, data.totalPages || 1);
      if (page > pages) list.set({ page: pages }, { replace: true });
    },
  });
  const posts: CampaignPost[] = postsData.data?.items ?? [];
  const counts: Record<PostStatusFilter, number> = { ...EMPTY_COUNTS, ...(postsData.data?.statusCounts ?? {}) };
  const summary = postsData.data?.summary;
  const reloadPosts = () => postsData.reload(true);
  const ai = useAiTextTask(reloadPosts);

  const accounts: SocialAccount[] = campaign?.socialAccounts || [];
  const active = campaign?.status === 'active';

  const askSend = (post: CampaignPost) => {
    if (!active) {
      toast.error(t('v2.campaigns.inactiveCannotSend'));
      return;
    }
    setSendTarget(post);
  };

  const confirmSend = async () => {
    if (!sendTarget) return;
    await action.run(
      async () => {
        try {
          const result = await sendPostNow(sendTarget.id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const failure = result?.results?.find((r: any) => !r.ok);
          if (failure) throw new Error(`${t('v2.campaigns.publishFailed')} · ${failure.error || result?.error || ''}`);
        } finally {
          await reloadPosts();
        }
      },
      { key: sendTarget.id, success: t('v2.campaigns.postPublished'), error: t('v2.campaigns.sendFailed') },
    );
  };

  const toggleStatus = () => {
    if (!campaign || !id) return;
    const next = active ? 'archived' : 'active';
    void action.run(
      async () => {
        await updateCampaign(id, { status: next });
        campaignData.setData({ ...campaign, status: next });
      },
      { key: 'status', success: next === 'active' ? t('v2.campaigns.resumed') : t('v2.campaigns.paused'), error: t('v2.campaigns.updateFailed') },
    );
  };

  if (campaignData.loading) return <LoadingState label={t('v2.campaigns.loadingCampaign')} minHeight={400} />;
  if (campaignData.error || !campaign) {
    return (
      <Page width="narrow">
        <ErrorState message={campaignData.error ? errorText(campaignData.error, t('v2.campaigns.loadCampaignFailed')) : t('v2.campaigns.notFound')} onRetry={() => void campaignData.reload()} retryLabel={t('v2.common.retry')} />
        <div className="flex justify-center">
          <Button variant="tonal" icon="arrow_back" href="/campaigns">
            {t('v2.campaigns.backToCampaigns')}
          </Button>
        </div>
      </Page>
    );
  }

  const total = counts.all;
  const progress = total > 0 ? counts.completed / total : 0;
  const schedule = formatSchedule(summary?.scheduledStart ? new Date(summary.scheduledStart) : null, summary?.scheduledEnd ? new Date(summary.scheduledEnd) : null);
  const mediaCount = summary?.mediaCount || 0;
  const channelCount = accounts.length;

  return (
    <Page density="compact">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <StatusPill tone={active ? 'success' : 'neutral'}>{active ? t('v2.campaigns.active') : t('status.paused')}</StatusPill>
          </span>
        }
        description={campaign.description || undefined}
        backLink={{ to: '/campaigns', label: t('v2.campaigns.backToCampaigns') }}
        actions={
          <>
            <Button variant="tonal" icon="stacks" href={`/campaigns/${campaign.id}/batch`}>
              {t('v2.campaigns.batchActions')}
            </Button>
            <Button variant="filled" icon="add" href={`/campaigns/${id}/posts/new`} className="v2-hide-mobile">
              {t('v2.campaigns.addPost')}
            </Button>
            <ActionMenu
              label={t('v2.campaigns.options')}
              variant="tonal"
              items={[
                { key: 'edit', label: t('v2.campaigns.settings'), icon: 'settings', href: `/campaigns/edit/${campaign.id}` },
                { key: 'status', label: active ? t('menu.pause') : t('menu.resume'), icon: active ? 'pause' : 'play_arrow', disabled: action.isBusy('status'), onSelect: toggleStatus },
                { key: 'delete', label: t('deleteDialog.title'), icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteCampaignOpen(true) },
              ]}
            />
          </>
        }
      />

      {!active && (
        <div className="v2-notice" data-tone="warning">
          <Icon name="pause_circle" />
          <Text variant="body-medium" className="flex-1">
            {t('v2.campaigns.pausedNotice')}
          </Text>
          <Button variant="filled" size="xs" icon="play_arrow" loading={action.isBusy('status')} onClick={toggleStatus}>
            {t('v2.campaigns.resume')}
          </Button>
        </div>
      )}

      <section className="v2-campaign-summary" aria-label={t('v2.campaigns.summary')}>
        {total > 0 && (
          <div className="v2-campaign-summary__progress">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <Text as="span" variant="display-small" emphasized className="tabular-nums text-primary">
                {Math.round(progress * 100)}%
              </Text>
              <Text as="span" variant="body-medium" className="tabular-nums text-on-surface-variant">
                {t('v2.campaigns.publishedOf', { done: counts.completed, total })}
              </Text>
            </div>
            <LinearProgress value={progress} max={1} shape="wavy" aria-label={t('v2.campaigns.progress')} />
          </div>
        )}
        <dl className="v2-campaign-summary__facts">
          {total > 0 && (
            <div>
              <dt>{t('v2.campaigns.schedule')}</dt>
              <dd>
                <Icon name="event" size={18} />
                {schedule || t('v2.campaigns.nothingScheduled')}
              </dd>
            </div>
          )}
          {mediaCount > 0 && (
            <div>
              <dt>{t('v2.campaigns.media')}</dt>
              <dd>
                <Icon name="perm_media" size={18} />
                {t('v2.campaigns.fileCount', { count: mediaCount })} · {formatBytes(summary?.mediaSize)}
              </dd>
            </div>
          )}
          <div>
            <dt>{t('channels')}</dt>
            <dd>
              {accounts.map((account) => (
                <span key={account.id} className="v2-channel-chip" title={`${displayAccountName(account)} · ${account.platform}`}>
                  <AccountAvatar account={account} size={24} refreshOn={['twitter', 'x', 'threads']} />
                  <span className="truncate">{displayAccountName(account)}</span>
                </span>
              ))}
              {accounts.length === 0 && (
                <Button variant="text" size="xs" icon="add_link" href={`/campaigns/edit/${campaign.id}`}>
                  {t('v2.campaigns.connectChannel')}
                </Button>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <ListPane
        variant="flush"
        label={t('v2.campaigns.posts')}
        lead={
          <SectionNav<PostStatusFilter>
            scope={`campaign-${id}`}
            label={t('v2.campaigns.filterByStatus')}
            value={statusFilter}
            onChange={(next) => list.set({ status: next })}
            items={POST_STATUS_FILTERS.filter((key) => key === 'all' || counts[key] > 0 || statusFilter === key).map((key) => ({ value: key, label: t(`v2.campaigns.statuses.${key}`), icon: POST_STATUS_ICONS[key], count: counts[key] }))}
          />
        }
        fitKey={`${statusFilter}|${Object.values(counts).join(',')}`}
        tools={
          <>
            <ListSearch value={q} onChange={list.setQuery} label={t('v2.campaigns.searchPosts')} />
            <SortMenu<PostSortKey> label={t('v2.campaigns.sort')} value={sortKey} onChange={(next) => list.set({ sort: next })} options={POST_SORT_KEYS.map((key) => ({ value: key, label: t(`v2.campaigns.sorts.${key}`), icon: POST_SORT_ICONS[key] }))} />
          </>
        }
        loading={postsData.loading}
        refreshing={postsData.refreshing}
        error={postsData.error ? errorText(postsData.error, t('v2.campaigns.loadPostsFailed')) : null}
        onRetry={() => void postsData.reload()}
        count={posts.length}
        filtered={list.filtered}
        onClearFilters={list.clearFilters}
        noMatches={{ title: t('v2.campaigns.noPostsMatch'), description: t('v2.campaigns.noPostsMatchHint') }}
        empty={{
          icon: 'post_add',
          shape: 'cookie-9',
          title: t('v2.campaigns.noPosts'),
          description: t('v2.campaigns.noPostsHint'),
          action: (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="filled" icon="add" href={`/campaigns/${id}/posts/new`}>
                {t('v2.campaigns.addPost')}
              </Button>
              <Button variant="tonal" icon="stacks" href={`/campaigns/${id}/batch/create`}>
                {t('v2.campaigns.createBatch')}
              </Button>
            </div>
          ),
        }}
        paging={{ page, pageSize, total: postsData.data?.total ?? 0, pages: postsData.data?.totalPages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: PAGE_SIZES }}
      >
        <div className="v2-post-grid">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              campaignId={campaign.id}
              active={active}
              sending={action.isBusy(post.id)}
              onSend={() => askSend(post)}
              onDelete={() => setDeletePostTarget(post)}
              onAiGenerate={() => setAiPostId(post.id)}
              onOpenMedia={(index) => setViewer({ media: post.media || [], index })}
              onChanged={reloadPosts}
            />
          ))}
        </div>
      </ListPane>
      <MobileFab icon="add" label={t('v2.campaigns.addPost')} href={`/campaigns/${id}/posts/new`} />

      {viewer && <PostMediaViewer media={viewer.media} index={viewer.index} onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))} onClose={() => setViewer(null)} />}
      <ConfirmDialog
        open={deletePostTarget !== null}
        tone="danger"
        title={t('v2.campaigns.deletePost')}
        message={
          <>
            {t('v2.campaigns.deletePostMessage')}
            {deletePostTarget?.textContent?.trim() && <span className="mt-2 line-clamp-3 block italic [overflow-wrap:anywhere]">“{deletePostTarget.textContent}”</span>}
          </>
        }
        confirmLabel={t('v2.campaigns.deletePost')}
        onClose={() => setDeletePostTarget(null)}
        onConfirm={async () => {
          if (!deletePostTarget) return;
          await action.run(
            async () => {
              await deletePost(deletePostTarget.id);
              await reloadPosts();
            },
            { key: `delete:${deletePostTarget.id}`, success: t('v2.campaigns.postDeleted'), error: t('v2.campaigns.deletePostFailed'), rethrow: true },
          );
        }}
      />
      <ConfirmDialog
        open={sendTarget !== null}
        title={sendTarget?.status === 'completed' ? t('v2.campaigns.sendAgainTitle') : t('v2.campaigns.sendNowTitle')}
        message={sendTarget?.status === 'completed' ? t('v2.campaigns.sendAgainMessage', { count: channelCount }) : t('v2.campaigns.sendNowMessage', { count: channelCount })}
        confirmLabel={sendTarget?.status === 'completed' ? t('v2.campaigns.sendAgain') : t('v2.campaigns.sendNow')}
        onClose={() => setSendTarget(null)}
        onConfirm={confirmSend}
      />
      <ConfirmDialog
        open={deleteCampaignOpen}
        tone="danger"
        title={t('deleteDialog.title')}
        message={t('deleteDialog.description', { name: campaign.name })}
        confirmLabel={t('deleteDialog.confirm')}
        onClose={() => setDeleteCampaignOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          await action.run(
            async () => {
              await deleteCampaign(id);
              navigate('/campaigns');
            },
            { key: 'delete', success: t('v2.campaigns.deleted'), error: t('v2.campaigns.deleteFailed'), rethrow: true },
          );
        }}
      />
      {aiPostId && (
        <BatchAiGenerateDialog
          postIds={[aiPostId]}
          onClose={() => setAiPostId(null)}
          onQueued={(task) => {
            ai.start(task);
            setAiPostId(null);
          }}
        />
      )}
    </Page>
  );
}
