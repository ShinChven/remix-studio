import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { deleteCampaign, deletePost, fetchBatchGeneratePostTextStatus, fetchCampaign, fetchCampaignPosts, sendPostNow, updateCampaign, type BatchGenerateTextResult } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { formatShortDate } from '../../lib/date';
import { Button, ChipSet, FilterChip, Icon, LinearProgress, Select, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { PostCard, type PostCardMedia, type PostCardPost } from '../components/campaigns/PostCard';
import { PostMediaViewer } from '../components/campaigns/PostMediaViewer';
import { usePaginationScroll } from '../lib/usePaginationScroll';
import { formatBytes } from '../lib/format';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import { PagedFooter } from '../ui/PagedFooter';
import { SearchField } from '../ui/SearchField';
import { StatusPill } from '../ui/Stat';
import { MobileFab } from '../ui/Toolbar';
import { useToast } from '../ui/useToast';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'queued' | 'completed' | 'failed';
type SortKey = 'scheduled_asc' | 'scheduled_desc' | 'created_desc' | 'created_asc';

const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'scheduled', 'queued', 'completed', 'failed'];
const SORT_KEYS: SortKey[] = ['scheduled_asc', 'scheduled_desc', 'created_desc', 'created_asc'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

function parsePositiveInt(value: string | null, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback;
}
function parsePageSize(value: string | null, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = parsePositiveInt(value, fallback);
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : fallback;
}
const parseStatusFilter = (value: string | null): StatusFilter => (STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'all');
const parseSortKey = (value: string | null): SortKey => (SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : 'scheduled_asc');

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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<CampaignPost[]>([]);
  const [matching, setMatching] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [postsLoading, setPostsLoading] = useState(true);
  const [counts, setCounts] = useState<Record<StatusFilter, number>>({ all: 0, draft: 0, scheduled: 0, queued: 0, completed: 0, failed: 0 });
  const [summary, setSummary] = useState({ mediaSize: 0, mediaCount: 0, scheduledStart: null as string | null, scheduledEnd: null as string | null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const sortKey = parseSortKey(searchParams.get('sort'));
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const pageSize = parsePageSize(searchParams.get('pageSize') || searchParams.get('limit'));
  const paginationRef = usePaginationScroll({ page, pageSize });
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<CampaignPost | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<CampaignPost | null>(null);
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [aiPostId, setAiPostId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [viewer, setViewer] = useState<{ media: PostMedia[]; index: number } | null>(null);

  const updateQuery = (updates: Record<string, string>, replace = false) => {
    const params = new URLSearchParams(searchParams);
    const resetsPage = Object.keys(updates).some((key) => key !== 'page');
    for (const [key, value] of Object.entries(updates)) {
      const trimmed = value.trim();
      const isDefault = (key === 'status' && trimmed === 'all') || (key === 'sort' && trimmed === 'scheduled_asc') || (key === 'pageSize' && trimmed === String(DEFAULT_PAGE_SIZE)) || (key === 'page' && trimmed === '1');
      if (trimmed && !isDefault) params.set(key, trimmed);
      else params.delete(key);
    }
    if (resetsPage) params.delete('page');
    setSearchParams(params, { replace });
  };

  const loadCampaign = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      setCampaign(await fetchCampaign(id, false));
      setError(null);
    } catch (err) {
      setError((err as Error)?.message || 'Failed to load campaign');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const postsRequest = useRef(0);
  const loadPosts = async (silent = false) => {
    if (!id) return;
    const request = ++postsRequest.current;
    if (!silent) setPostsLoading(true);
    try {
      const data = await fetchCampaignPosts(id, { page, pageSize, q: searchQuery, status: statusFilter, sort: sortKey });
      if (request !== postsRequest.current) return;
      const pages = Math.max(1, data.totalPages || 1);
      if (page > pages) {
        updateQuery({ page: String(pages) }, true);
        return;
      }
      setPosts(data.items || []);
      setMatching(data.total || 0);
      setTotalPages(pages);
      const c = data.statusCounts || {};
      setCounts({ all: c.all || 0, draft: c.draft || 0, scheduled: c.scheduled || 0, queued: c.queued || 0, completed: c.completed || 0, failed: c.failed || 0 });
      setSummary({ mediaSize: data.summary?.mediaSize || 0, mediaCount: data.summary?.mediaCount || 0, scheduledStart: data.summary?.scheduledStart || null, scheduledEnd: data.summary?.scheduledEnd || null });
      setError(null);
    } catch (err) {
      if (request !== postsRequest.current) return;
      toast.error((err as Error)?.message || 'Failed to load campaign posts');
    } finally {
      if (request === postsRequest.current) setPostsLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Normalize a legacy `limit` or an unknown page size in the URL.
  useEffect(() => {
    const raw = searchParams.get('pageSize');
    const legacy = searchParams.get('limit');
    const value = raw || legacy;
    if (!value) return;
    const normalized = parsePageSize(value);
    if (raw === String(normalized) && !legacy) return;
    const params = new URLSearchParams(searchParams);
    params.delete('limit');
    params.delete('page');
    if (normalized === DEFAULT_PAGE_SIZE) params.delete('pageSize');
    else params.set('pageSize', String(normalized));
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadPosts();
    return () => { postsRequest.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, page, pageSize, searchQuery, statusFilter, sortKey]);

  // The campaign or its posts changed elsewhere; batch post changes name no campaign, so they match too.
  useLiveRefresh(
    (event) => (event.resource === 'campaign' ? event.id === id : event.resource === 'post' && (!event.campaignId || event.campaignId === id)),
    () => Promise.all([loadCampaign(true), loadPosts(true)]),
  );

  // Follow an AI text run until it finishes.
  useEffect(() => {
    if (!aiTask?.batchId || aiTask.status === 'completed' || aiTask.status === 'failed') return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || !aiTask.batchId) return;
      polling = true;
      try {
        const status = await fetchBatchGeneratePostTextStatus(aiTask.batchId);
        if (cancelled) return;
        setAiTask(status);
        if (status.completed !== aiTask.completed) await loadPosts(true);
        if (status.status === 'completed' || status.status === 'failed') {
          const ok = status.results.filter((r) => r.ok).length;
          const fail = status.results.length - ok;
          const failure = status.error || status.results.find((r) => !r.ok)?.error;
          if (status.status === 'failed') toast.error(failure || `Generated ${ok}, failed ${fail}`);
          else if (fail > 0) toast.info(`Generated ${ok}, failed ${fail}${failure ? ` · ${failure}` : ''}`);
          else toast.success(`Generated text for ${ok} post${ok === 1 ? '' : 's'}`);
          await loadPosts(true);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error((err as Error)?.message || 'Failed to refresh AI generation status');
          setAiTask(null);
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTask?.batchId, aiTask?.completed, aiTask?.status]);

  const accounts: SocialAccount[] = campaign?.socialAccounts || [];
  const active = campaign?.status === 'active';

  const askSend = (post: CampaignPost) => {
    if (!active) {
      toast.error('Campaign is inactive · Activate the campaign before sending posts.');
      return;
    }
    setSendTarget(post);
  };

  const confirmSend = async () => {
    if (!sendTarget) return;
    try {
      setSendingId(sendTarget.id);
      const result = await sendPostNow(sendTarget.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allOk = result?.results?.every((r: any) => r.ok) ?? true;
      if (allOk) toast.success('Post published successfully');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else toast.error(`Failed to publish post · ${result?.results?.find((r: any) => !r.ok)?.error || result?.error || 'Publish failed'}`);
      await loadPosts(true);
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to send post');
      await loadPosts(true);
    } finally {
      setSendingId(null);
    }
  };

  const toggleStatus = async () => {
    if (!campaign || !id) return;
    const next = active ? 'archived' : 'active';
    try {
      await updateCampaign(id, { status: next });
      setCampaign({ ...campaign, status: next });
      toast.success(next === 'active' ? 'Campaign resumed' : 'Campaign paused');
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to update campaign');
    }
  };

  if (loading && !campaign) return <LoadingState label="Loading campaign details..." minHeight={400} />;
  if (error || !campaign) {
    return (
      <Page width="narrow">
        <ErrorState message={error || 'Campaign not found'} />
        <div className="flex justify-center">
          <Button variant="tonal" icon="arrow_back" href="/campaigns">
            Back to Campaigns
          </Button>
        </div>
      </Page>
    );
  }

  const total = counts.all;
  const progress = total > 0 ? counts.completed / total : 0;
  const schedule = formatSchedule(summary.scheduledStart ? new Date(summary.scheduledStart) : null, summary.scheduledEnd ? new Date(summary.scheduledEnd) : null);
  const filters: Array<[StatusFilter, string]> = [
    ['all', 'All'],
    ['draft', 'Draft'],
    ['scheduled', 'Scheduled'],
    ['queued', 'Queued'],
    ['completed', 'Posted'],
    ['failed', 'Failed'],
  ];
  const filtered = Boolean(searchQuery) || statusFilter !== 'all';

  return (
    <Page ref={paginationRef} density="compact">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <StatusPill tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Paused'}</StatusPill>
          </span>
        }
        description={campaign.description || undefined}
        backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
        actions={
          <>
            <Button variant="tonal" icon="stacks" href={`/campaigns/${campaign.id}/batch`}>
              Batch Actions
            </Button>
            <Button variant="filled" icon="add" href={`/campaigns/${id}/posts/new`} className="v2-hide-mobile">
              Add Post
            </Button>
            <ActionMenu
              label="Campaign options"
              variant="tonal"
              items={[
                { key: 'edit', label: 'Campaign Settings', icon: 'settings', href: `/campaigns/edit/${campaign.id}` },
                { key: 'status', label: active ? 'Pause Campaign' : 'Resume Campaign', icon: active ? 'pause' : 'play_arrow', onSelect: () => void toggleStatus() },
                { key: 'delete', label: 'Delete Campaign', icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteCampaignOpen(true) },
              ]}
            />
          </>
        }
      />

      {!active && (
        <div className="v2-notice" data-tone="warning">
          <Icon name="pause_circle" />
          <Text variant="body-medium" className="flex-1">
            This campaign is paused. Scheduled posts stay in the queue and nothing is sent until it resumes.
          </Text>
          <Button variant="filled" size="xs" icon="play_arrow" onClick={() => void toggleStatus()}>
            Resume
          </Button>
        </div>
      )}

      <section className="v2-campaign-summary" aria-label="Campaign summary">
        {total > 0 && (
          <div className="v2-campaign-summary__progress">
            <div className="flex items-baseline gap-3">
              <Text as="span" variant="display-small" emphasized className="tabular-nums text-primary">
                {Math.round(progress * 100)}%
              </Text>
              <Text as="span" variant="body-medium" className="tabular-nums text-on-surface-variant">
                {counts.completed} of {total} posts published
              </Text>
            </div>
            <LinearProgress value={progress} max={1} shape="wavy" aria-label="Campaign progress" />
          </div>
        )}
        <dl className="v2-campaign-summary__facts">
          {total > 0 && (
            <div>
              <dt>Schedule</dt>
              <dd>
                <Icon name="event" size={18} />
                {schedule || 'Nothing scheduled'}
              </dd>
            </div>
          )}
          {summary.mediaCount > 0 && (
            <div>
              <dt>Media</dt>
              <dd>
                <Icon name="perm_media" size={18} />
                {summary.mediaCount} {summary.mediaCount === 1 ? 'file' : 'files'} · {formatBytes(summary.mediaSize)}
              </dd>
            </div>
          )}
          <div>
            <dt>Channels</dt>
            <dd>
              {accounts.map((account) => (
                <span key={account.id} className="v2-channel-chip" title={`${displayAccountName(account)} · ${account.platform}`}>
                  <AccountAvatar account={account} size={24} refreshOn={['twitter', 'x', 'threads']} />
                  <span className="truncate">{displayAccountName(account)}</span>
                </span>
              ))}
              {accounts.length === 0 && (
                <Button variant="text" size="xs" icon="add_link" href={`/campaigns/edit/${campaign.id}`}>
                  Connect a channel
                </Button>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {total > 0 && (
        <div className="v2-campaign-filters">
          <ChipSet scroll aria-label="Filter by status">
            {filters
              .filter(([key]) => key === 'all' || counts[key] > 0 || statusFilter === key)
              .map(([key, label]) => (
                <FilterChip
                  key={key}
                  selected={statusFilter === key}
                  label={
                    <>
                      {label} <span className="v2-chip-count">{counts[key]}</span>
                    </>
                  }
                  onClick={() => updateQuery({ status: key })}
                />
              ))}
          </ChipSet>
          <div className="v2-campaign-filters__tools">
            <SearchField value={searchQuery} onChange={(v) => updateQuery({ q: v }, true)} placeholder="Search posts..." className="v2-header-search" />
            <Select<SortKey>
              variant="outlined"
              aria-label="Sort"
              leadingIcon="sort"
              value={sortKey}
              onChange={(v) => updateQuery({ sort: v })}
              options={[
                { value: 'scheduled_asc', label: 'Scheduled (Soonest First)' },
                { value: 'scheduled_desc', label: 'Scheduled (Latest First)' },
                { value: 'created_desc', label: 'Created (Newest First)' },
                { value: 'created_asc', label: 'Created (Oldest First)' },
              ]}
              className="v2-inline-select v2-inline-select--sort"
            />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-col gap-3" aria-busy={postsLoading}>
        {postsLoading && posts.length === 0 && <LoadingState label="Loading posts..." minHeight={200} />}
        {posts.length > 0 && (
          <div className="v2-post-grid">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                campaignId={campaign.id}
                active={active}
                sending={sendingId === post.id}
                onSend={() => askSend(post)}
                onDelete={() => setDeletePostTarget(post)}
                onAiGenerate={() => setAiPostId(post.id)}
                onOpenMedia={(index) => setViewer({ media: post.media || [], index })}
                onChanged={() => loadPosts(true)}
              />
            ))}
          </div>
        )}
        {!postsLoading && posts.length === 0 &&
          (filtered ? (
            <EmptyState
              icon="search_off"
              title="No posts match"
              description="Try another status or search."
              action={
                <Button variant="tonal" icon="filter_alt_off" onClick={() => updateQuery({ q: '', status: 'all' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon="post_add"
              shape="cookie-9"
              title="No posts yet"
              description="Write a post, or queue many at once from your libraries and albums."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="filled" icon="add" href={`/campaigns/${id}/posts/new`}>
                    Add Post
                  </Button>
                  <Button variant="tonal" icon="stacks" href={`/campaigns/${id}/batch/create`}>
                    Create Batch
                  </Button>
                </div>
              }
            />
          ))}
        <PagedFooter
          page={page}
          pageSize={pageSize}
          total={matching}
          pages={totalPages}
          onPageChange={(next) => updateQuery({ page: String(next) })}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(next) => updateQuery({ pageSize: String(next) })}
        />
      </main>
      <MobileFab icon="add" label="Add Post" href={`/campaigns/${id}/posts/new`} />

      {viewer && <PostMediaViewer media={viewer.media} index={viewer.index} onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))} onClose={() => setViewer(null)} />}
      <ConfirmDialog
        open={deletePostTarget !== null}
        tone="danger"
        title="Delete Post"
        message={
          <>
            Are you sure you want to delete this post? This action cannot be undone.
            {deletePostTarget?.textContent?.trim() && <span className="mt-2 line-clamp-3 block italic [overflow-wrap:anywhere]">"{deletePostTarget.textContent}"</span>}
          </>
        }
        confirmLabel="Delete Post"
        onClose={() => setDeletePostTarget(null)}
        onConfirm={async () => {
          if (!deletePostTarget) return;
          try {
            await deletePost(deletePostTarget.id);
            await loadPosts(true);
            toast.success('Post deleted');
          } catch (err) {
            toast.error((err as Error)?.message || 'Failed to delete post');
            throw err;
          }
        }}
      />
      <ConfirmDialog
        open={sendTarget !== null}
        title={sendTarget?.status === 'completed' ? 'Send This Post Again?' : 'Publish This Post Now?'}
        message={
          sendTarget?.status === 'completed'
            ? `This post was already published${accounts.length > 0 ? ` to ${accounts.length} channel${accounts.length === 1 ? '' : 's'}` : ''}. Sending it again posts a duplicate that cannot be unsent.`
            : `Publish this post${accounts.length > 0 ? ` to ${accounts.length} connected channel${accounts.length === 1 ? '' : 's'}` : ''} right now? It goes live immediately and cannot be unsent.`
        }
        confirmLabel={sendTarget?.status === 'completed' ? 'Send Again' : 'Send Now'}
        cancelLabel="Cancel"
        onClose={() => setSendTarget(null)}
        onConfirm={confirmSend}
      />
      <ConfirmDialog
        open={deleteCampaignOpen}
        tone="danger"
        title="Delete Campaign"
        message={`Delete ${campaign.name}? This cannot be undone and will delete all associated posts.`}
        confirmLabel="Delete Campaign"
        cancelLabel="Cancel"
        onClose={() => setDeleteCampaignOpen(false)}
        onConfirm={async () => {
          if (!id) return;
          try {
            await deleteCampaign(id);
            toast.success('Campaign deleted');
            navigate('/campaigns');
          } catch (err) {
            toast.error((err as Error)?.message || 'Failed to delete campaign');
          }
        }}
      />
      {aiPostId && (
        <BatchAiGenerateDialog
          postIds={[aiPostId]}
          onClose={() => setAiPostId(null)}
          onQueued={(task) => {
            setAiTask(task);
            setAiPostId(null);
          }}
        />
      )}
    </Page>
  );
}
