import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { batchUnschedulePosts, deleteCampaign, deletePost, fetchBatchGeneratePostTextStatus, fetchCampaign, fetchCampaignPosts, sendPostNow, updateCampaign, updatePost, type BatchGenerateTextResult } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { resourceRef } from '../../lib/resource-ref';
import { Button, Icon, IconButton, LinearProgress, Select, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { mediaFullUrl, mediaPosterUrl, PostMediaViewer, type ViewerMedia } from '../components/campaigns/PostMediaViewer';
import { CopyRefButton } from '../components/CopyRefButton';
import { formatBytes } from '../lib/format';
import { PlatformIcon } from '../lib/platform';
import { postStatusLabel, postStatusTone, toDatetimeLocal } from '../lib/posts';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { SearchField } from '../ui/SearchField';
import { StatusPill } from '../ui/Stat';
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

interface PostMedia extends ViewerMedia {
  id: string;
  status?: string;
}

interface CampaignPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  media?: PostMedia[];
  executions?: Array<{ id: string; status: string; externalUrl?: string | null; socialAccount?: SocialAccount }>;
}

const displayAccountName = (account: SocialAccount) => account.profileName || account.accountId || account.platform;

function formatDateTime(date: Date | null) {
  if (!date) return 'Not scheduled';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState('');
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
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

  const loadPosts = async (silent = false) => {
    if (!id) return;
    if (!silent) setPostsLoading(true);
    try {
      const data = await fetchCampaignPosts(id, { page, pageSize, q: searchQuery, status: statusFilter, sort: sortKey });
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
      toast.error((err as Error)?.message || 'Failed to load campaign posts');
    } finally {
      if (!silent) setPostsLoading(false);
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

  const quickSchedule = async (post: CampaignPost) => {
    if (!quickDate) {
      toast.error('Please select a schedule time');
      return;
    }
    try {
      setQuickSavingId(post.id);
      await updatePost(post.id, { textContent: post.textContent || '', status: 'scheduled', scheduledAt: new Date(quickDate).toISOString() });
      toast.success('Post scheduled');
      setQuickId(null);
      setQuickDate('');
      await loadPosts(true);
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to schedule post');
    } finally {
      setQuickSavingId(null);
    }
  };

  const unschedule = async (postId: string) => {
    try {
      await batchUnschedulePosts([postId]);
      toast.success('Post unscheduled');
      await loadPosts(true);
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to unschedule post');
    }
  };

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
  const start = summary.scheduledStart ? new Date(summary.scheduledStart) : null;
  const end = summary.scheduledEnd ? new Date(summary.scheduledEnd) : null;
  const filters: Array<[StatusFilter, string, number]> = [
    ['all', 'Total', counts.all],
    ['draft', 'Draft', counts.draft],
    ['scheduled', 'Scheduled', counts.scheduled],
    ['completed', 'Posted', counts.completed],
    ['failed', 'Failed', counts.failed],
  ];

  return (
    <Page density="compact">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {campaign.name}
            <StatusPill tone={active ? 'success' : 'neutral'}>{active ? 'Active' : 'Inactive'}</StatusPill>
          </span>
        }
        description={campaign.description || 'No description provided.'}
        backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
        actions={
          <>
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
              className="v2-inline-select"
            />
            <IconButton icon="settings" variant="tonal" label="Settings" tooltip href={`/campaigns/edit/${campaign.id}`} />
            <IconButton icon="stacks" variant="tonal" label="Batch Actions" tooltip href={`/campaigns/${campaign.id}/batch`} />
            <IconButton icon="add" variant="filled" label="Add Post" tooltip href={`/campaigns/${id}/posts/new`} />
          </>
        }
      />
      <div className="v2-campaign-detail">
        <aside className="flex flex-col gap-3">
          <Section variant="card" title="Campaign Progress">
            <div className="flex flex-col gap-3">
              <Text variant="display-small" emphasized className="tabular-nums text-primary">
                {Math.round(progress * 100)}%
              </Text>
              <LinearProgress value={progress} max={1} shape="wavy" aria-label="Campaign progress" />
              <Text variant="body-small" className="text-on-surface-variant">
                {counts.completed} of {total} posts published
              </Text>
              <div className="v2-status-filters">
                {filters.map(([key, label, count]) => (
                  <button key={key} type="button" className="v2-status-filter m3-focus-ring" data-wide={key === 'all' ? '' : undefined} data-selected={statusFilter === key ? '' : undefined} data-tone={postStatusTone(key === 'all' ? 'draft' : key)} onClick={() => updateQuery({ status: statusFilter === key && key !== 'all' ? 'all' : key })}>
                    <Text as="span" variant="title-medium" emphasized className="tabular-nums">
                      {count}
                    </Text>
                    <Text as="span" variant="label-small" className="uppercase tracking-widest">
                      {label}
                    </Text>
                  </button>
                ))}
              </div>
              <Button variant={active ? 'tonal' : 'filled'} icon={active ? 'pause' : 'play_arrow'} fullWidth onClick={() => void toggleStatus()}>
                {active ? 'Pause Campaign' : 'Resume Campaign'}
              </Button>
            </div>
          </Section>
          <Section variant="card" title="Campaign Info">
            <div className="flex flex-col gap-2">
              <div className="v2-kv v2-kv--row">
                <Text variant="label-medium" className="text-on-surface-variant">
                  Start Date
                </Text>
                <Text variant="label-large">{formatDateTime(start)}</Text>
              </div>
              <div className="v2-kv v2-kv--row">
                <Text variant="label-medium" className="text-on-surface-variant">
                  End Date
                </Text>
                <Text variant="label-large">{formatDateTime(end)}</Text>
              </div>
              <div className="v2-kv v2-kv--row">
                <Text variant="label-medium" className="text-on-surface-variant">
                  Media Storage
                </Text>
                <Text variant="label-large">
                  {formatBytes(summary.mediaSize)} <span className="text-on-surface-variant">({summary.mediaCount})</span>
                </Text>
              </div>
              <Text variant="label-small" className="mt-2 uppercase tracking-widest text-on-surface-variant">
                Connected Channels
              </Text>
              {accounts.map((account) => (
                <div key={account.id} className="flex items-center gap-2">
                  <AccountAvatar account={account} size={28} refreshOn={['twitter', 'x', 'threads']} />
                  <Text variant="label-large" className="min-w-0 flex-1 truncate">
                    {displayAccountName(account)}
                  </Text>
                  <PlatformIcon platform={account.platform} />
                </div>
              ))}
              {accounts.length === 0 && (
                <Text variant="body-small" className="text-on-surface-variant">
                  No channels connected.
                </Text>
              )}
              <Button variant="text" icon="delete" className="v2-button-danger mt-2" onClick={() => setDeleteCampaignOpen(true)}>
                Delete Campaign
              </Button>
            </div>
          </Section>
        </aside>

        <main className="flex min-w-0 flex-col gap-3">
          {postsLoading && <LoadingState label="Loading posts..." minHeight={200} />}
          {!postsLoading &&
            posts.map((post) => {
              const externalUrl = post.executions?.find((e) => e.externalUrl)?.externalUrl;
              return (
                <article key={post.id} className="v2-post-card">
                  <header className="flex flex-wrap items-center gap-3">
                    {accounts.length > 0 && (
                      <span className="v2-avatar-stack">
                        {accounts.slice(0, 4).map((a) => (
                          <AccountAvatar key={a.id} account={{ ...a, platform: undefined }} size={28} refreshOn={['twitter', 'x', 'threads']} />
                        ))}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <Text as="span" variant="label-medium" className="text-on-surface-variant">
                          {accounts.length} {accounts.length === 1 ? 'Channel' : 'Channels'}
                        </Text>
                        <StatusPill tone={postStatusTone(post.status)} icon={post.status === 'processing' ? 'progress_activity' : undefined}>
                          {postStatusLabel(post.status)}
                        </StatusPill>
                      </span>
                      <Text as="span" variant="label-small" className="flex items-center gap-1 text-on-surface-variant">
                        <Icon name="schedule" size={14} />
                        {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Not scheduled'}
                      </Text>
                    </div>
                    <span className="flex items-center">
                      <CopyRefButton reference={resourceRef.post(campaign.id, post.id)} />
                      <IconButton icon="open_in_new" size="xs" label="View Post" tooltip href={`/campaigns/${id}/posts/${post.id}`} />
                      <IconButton icon="edit" size="xs" label="Edit Post" tooltip href={`/campaigns/${id}/posts/edit/${post.id}`} />
                      <IconButton icon="auto_awesome" size="xs" label="AI Generate" tooltip onClick={() => setAiPostId(post.id)} />
                      <IconButton icon="delete" size="xs" label="Delete Post" tooltip onClick={() => setDeletePostTarget(post)} />
                    </span>
                  </header>
                  {post.textContent?.trim() && (
                    <Link to={`/campaigns/${id}/posts/${post.id}`} className="v2-post-card__text">
                      {post.textContent}
                    </Link>
                  )}
                  {post.media && post.media.length > 0 && (
                    <div className="v2-post-card__media" data-count={Math.min(post.media.length, 4)}>
                      {post.media.slice(0, 4).map((media, index) => {
                        const url = mediaFullUrl(media);
                        const poster = media.type === 'video' ? mediaPosterUrl(media) : '';
                        return (
                          <button key={media.id} type="button" className="v2-post-card__thumb m3-focus-ring" aria-label={`Open media ${index + 1}`} onClick={() => setViewer({ media: post.media || [], index })}>
                            {url && media.type !== 'video' ? (
                              <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" />
                            ) : poster ? (
                              <img src={poster} alt="" referrerPolicy="no-referrer" loading="lazy" />
                            ) : url && media.type === 'video' ? (
                              <video src={url} muted playsInline preload="metadata" />
                            ) : (
                              <Icon name="image" />
                            )}
                            {media.type === 'video' && (
                              <span className="v2-tile__overlay">
                                <Icon name="play_arrow" filled />
                              </span>
                            )}
                            {post.media!.length > 4 && index === 3 && <span className="v2-transfer-strip__more">+{post.media!.length - 4}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <footer className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {quickId === post.id ? (
                        <>
                          <TextField variant="outlined" type="datetime-local" aria-label="Schedule time" value={quickDate} onValueChange={setQuickDate} />
                          <Button variant="filled" size="xs" loading={quickSavingId === post.id} onClick={() => void quickSchedule(post)}>
                            Save
                          </Button>
                          <IconButton icon="close" size="xs" label="Cancel" onClick={() => setQuickId(null)} />
                        </>
                      ) : (
                        <>
                          <Button variant="filled" size="xs" icon="send" loading={sendingId === post.id} disabled={!active} onClick={() => askSend(post)}>
                            {post.status === 'completed' ? 'Send Again' : 'Send Now'}
                          </Button>
                          {!post.scheduledAt ? (
                            <Button
                              variant="tonal"
                              size="xs"
                              icon="schedule"
                              onClick={() => {
                                const time = new Date();
                                time.setHours(time.getHours() + 1);
                                setQuickDate(toDatetimeLocal(time));
                                setQuickId(post.id);
                              }}
                            >
                              Schedule
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="tonal"
                                size="xs"
                                icon="edit_calendar"
                                onClick={() => {
                                  const time = new Date(post.scheduledAt || new Date());
                                  if (Number.isNaN(time.getTime())) time.setHours(new Date().getHours() + 1);
                                  setQuickDate(toDatetimeLocal(time));
                                  setQuickId(post.id);
                                }}
                              >
                                Reschedule
                              </Button>
                              <Button variant="text" size="xs" icon="event_busy" onClick={() => void unschedule(post.id)}>
                                Unschedule
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {post.status === 'completed' ? (
                      <span className="flex items-center gap-2">
                        <StatusPill tone="success" icon="check_circle">
                          Published
                        </StatusPill>
                        {externalUrl && (
                          <Button variant="text" size="xs" trailingIcon="open_in_new" href={externalUrl} target="_blank" rel="noopener noreferrer">
                            View Post
                          </Button>
                        )}
                      </span>
                    ) : (
                      <StatusPill tone={postStatusTone(post.status)} icon="info">
                        {postStatusLabel(post.status)}
                      </StatusPill>
                    )}
                  </footer>
                </article>
              );
            })}
          {!postsLoading && posts.length === 0 && (
            <EmptyState
              icon="post_add"
              shape="cookie-9"
              title="No posts found in this campaign."
              action={
                <Button variant="filled" icon="add" href={`/campaigns/${id}/posts/new`}>
                  Create your first post
                </Button>
              }
            />
          )}
          <div className="v2-paged-footer">
            <span className="flex items-center gap-3">
              <Text variant="label-medium" className="text-on-surface-variant">
                Showing {matching === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, matching)} of {matching}
              </Text>
              <Select
                variant="outlined"
                aria-label="Page size"
                value={String(pageSize)}
                onChange={(v) => updateQuery({ pageSize: v })}
                options={PAGE_SIZE_OPTIONS.map((o) => ({ value: String(o), label: `${o} / page` }))}
                className="v2-inline-select"
              />
            </span>
            <span className="flex items-center gap-2">
              <Text variant="label-medium" className="text-on-surface-variant">
                Page {page} / {Math.max(1, totalPages)}
              </Text>
              <Pagination page={page} pages={Math.max(1, totalPages)} onPageChange={(next) => updateQuery({ page: String(next) })} />
            </span>
          </div>
        </main>
      </div>

      {viewer && <PostMediaViewer media={viewer.media} index={viewer.index} onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))} onClose={() => setViewer(null)} />}
      <ConfirmDialog
        open={deletePostTarget !== null}
        tone="danger"
        title="Delete Post"
        message={
          <>
            Are you sure you want to delete this post? This action cannot be undone.
            {deletePostTarget?.textContent?.trim() && <span className="mt-2 block italic">"{deletePostTarget.textContent}"</span>}
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
