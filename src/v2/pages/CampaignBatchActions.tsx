import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { batchUnschedulePosts, deletePost, fetchBatchGeneratePostTextStatus, fetchCampaign, fetchCampaignPostIds, fetchCampaignPosts, sendPostNow, type BatchGenerateTextResult } from '../../api';
import { Button, Checkbox, ChipSet, FilterChip, Icon, IconButton, LinearProgress, Select, Text, useMediaQuery } from '../../m3';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { BatchScheduleDialog, BatchSetTextDialog } from '../components/campaigns/BatchPostDialogs';
import { PostMediaViewer } from '../components/campaigns/PostMediaViewer';
import { usePaginationScroll } from '../lib/usePaginationScroll';
import { formatPostTime } from '../components/campaigns/PostCard';
import { postStatusLabel, postStatusTone } from '../lib/posts';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { PagedFooter } from '../ui/PagedFooter';
import { Row, RowList } from '../ui/Rows';
import { SearchField } from '../ui/SearchField';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

interface BatchPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  createdAt?: string;
  media?: Array<{
    id: string;
    sourceUrl?: string | null;
    processedUrl?: string | null;
    thumbnailUrl?: string | null;
    type?: string;
  }>;
}

type SortKey = 'scheduled_asc' | 'scheduled_desc' | 'created_desc' | 'created_asc';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000];
const DEFAULT_PAGE_SIZE = 50;

function parsePageSize(value: string | null, fallback = DEFAULT_PAGE_SIZE) {
  const number = Number(value);
  const parsed = Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback;
  return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : fallback;
}


function mediaPreviewUrl(media: NonNullable<BatchPost['media']>[number]) {
  const value = media.thumbnailUrl || media.processedUrl || media.sourceUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}


/** Selects many posts of a campaign and acts on them together: AI text, set text, schedule, send and delete. */
export function CampaignBatchActions() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<BatchPost[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const compact = useMediaQuery('(max-width: 899.98px)');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [allMatchingSelected, setAllMatchingSelected] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [unscheduleOpen, setUnscheduleOpen] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [setTextOpen, setSetTextOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ media: NonNullable<BatchPost['media']>; index: number } | null>(null);

  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const sortKey = (searchParams.get('sort') || 'scheduled_desc') as SortKey;
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = parsePageSize(searchParams.get('pageSize') || searchParams.get('limit'));
  const paginationRef = usePaginationScroll({ page, pageSize });

  const updateQuery = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    const resetsSelection = Object.keys(updates).some((key) => key !== 'page');
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (resetsSelection) {
      params.set('page', '1');
      setSelectedPostIds([]);
      setAllMatchingSelected(false);
    }
    setSearchParams(params);
  };

  const listRequest = useRef(0);
  const loadData = async (silent = false, preserveSelection = true) => {
    if (!id) return;
    const request = ++listRequest.current;
    if (!silent) setIsLoading(true);
    try {
      const [campaignData, postData] = await Promise.all([
        campaign ? Promise.resolve(campaign) : fetchCampaign(id, false),
        fetchCampaignPosts(id, { page, pageSize, q: searchQuery, status: statusFilter, sort: sortKey }),
      ]);
      if (request !== listRequest.current) return;
      setCampaign(campaignData);
      setPosts(postData.items || []);
      setTotalPosts(postData.total || 0);
      setTotalPages(postData.totalPages || 1);
      setCounts(postData.statusCounts || {});
      if (!preserveSelection) {
        setSelectedPostIds([]);
        setAllMatchingSelected(false);
      }
    } catch (error) {
      if (request !== listRequest.current) return;
      toast.error((error as Error)?.message || 'Failed to load batch actions');
    } finally {
      if (request === listRequest.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData(false, true);
    return () => { listRequest.current++; };
  }, [id, page, pageSize, searchQuery, statusFilter, sortKey]);

  useEffect(() => {
    const rawPageSize = searchParams.get('pageSize');
    const legacyLimit = searchParams.get('limit');
    const pageSizeParam = rawPageSize || legacyLimit;
    if (!pageSizeParam) return;

    const normalizedPageSize = parsePageSize(pageSizeParam);
    if (rawPageSize === String(normalizedPageSize) && !legacyLimit) return;

    const params = new URLSearchParams(searchParams);
    params.delete('limit');
    params.set('page', '1');
    if (normalizedPageSize === DEFAULT_PAGE_SIZE) {
      params.delete('pageSize');
    } else {
      params.set('pageSize', String(normalizedPageSize));
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!aiTask?.batchId || aiTask.status === 'completed' || aiTask.status === 'failed') return;

    let cancelled = false;
    let polling = false;

    const pollAiTask = async () => {
      if (polling || !aiTask.batchId) return;
      polling = true;
      try {
        const status = await fetchBatchGeneratePostTextStatus(aiTask.batchId);
        if (cancelled) return;

        setAiTask(status);
        if (status.completed !== aiTask.completed) {
          await loadData(true, true);
        }

        if (status.status === 'completed' || status.status === 'failed') {
          const ok = status.results.filter((result) => result.ok).length;
          const fail = status.results.length - ok;
          const failureMessage = status.error || status.results.find((result) => !result.ok)?.error;
          if (status.status === 'failed') {
            toast.error(failureMessage || `Generated ${ok}, failed ${fail}`);
          } else if (fail > 0) {
            toast.info(`Generated ${ok}, failed ${fail}${failureMessage ? ` · ${failureMessage}` : ''}`);
          } else {
            toast.success(`Generated text for ${ok} post${ok === 1 ? '' : 's'}`);
          }
          await loadData(true, true);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error((error as Error)?.message || 'Failed to refresh AI generation status');
          setAiTask(null);
        }
      } finally {
        polling = false;
      }
    };

    void pollAiTask();
    const timer = window.setInterval(() => void pollAiTask(), 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aiTask?.batchId, aiTask?.completed, aiTask?.status]);

  const visiblePosts = posts;

  const allVisibleSelected = visiblePosts.length > 0 && visiblePosts.every((post) => selectedPostIds.includes(post.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visiblePosts.map((post) => post.id));
      setSelectedPostIds((prev) => prev.filter((id) => !visibleIds.has(id)));
      setAllMatchingSelected(false);
    } else {
      setSelectedPostIds((prev) => Array.from(new Set([...prev, ...visiblePosts.map((post) => post.id)])));
    }
  };

  const toggleSelectPost = (postId: string, index: number, shiftKey?: boolean) => {
    setAllMatchingSelected(false);
    setSelectedPostIds((prev) => {
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const rangeIds = visiblePosts.slice(start, end + 1).map((post) => post.id);
        return Array.from(new Set([...prev, ...rangeIds]));
      }
      setLastSelectedIndex(index);
      return prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId];
    });
  };

  const selectAllMatchingPosts = async () => {
    if (!id) return;
    try {
      const data = await fetchCampaignPostIds(id, { q: searchQuery, status: statusFilter, sort: sortKey });
      setSelectedPostIds(data.ids);
      setAllMatchingSelected(true);
      toast.success(`Selected ${data.total} matching post${data.total === 1 ? '' : 's'}`);
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to select matching posts');
    }
  };

  const handleBatchSend = () => {
    if (selectedPostIds.length === 0) return;
    if (campaign?.status !== 'active') {
      toast.error('Campaign is inactive · Activate the campaign before sending posts.');
      return;
    }
    setSendProgress(0);
    setSendOpen(true);
  };

  const confirmBatchSend = async () => {
    if (selectedPostIds.length === 0) return;
    setSending(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const postId of selectedPostIds) {
        try {
          await sendPostNow(postId);
          ok++;
        } catch {
          fail++;
        }
        setSendProgress(ok + fail);
      }
      if (fail > 0) toast.info(`Sent ${ok}, failed ${fail}`);
      else toast.success(`Sent ${ok} post${ok === 1 ? '' : 's'}`);
      setSendOpen(false);
      await loadData(true, false);
    } finally {
      setSending(false);
    }
  };

  const handleBatchUnschedule = () => {
    if (selectedPostIds.length === 0) return;
    setUnscheduleOpen(true);
  };

  const confirmBatchUnschedule = async () => {
    if (selectedPostIds.length === 0) return;
    setUnscheduling(true);
    try {
      const result = await batchUnschedulePosts(selectedPostIds);
      if (result.skipped.length > 0) toast.info(`Unscheduled ${result.updated}. Skipped ${result.skipped.length}.`);
      else toast.success(`Unscheduled ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      setUnscheduleOpen(false);
      await loadData(true, false);
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to unschedule posts');
    } finally {
      setUnscheduling(false);
    }
  };

  const confirmBatchDelete = async () => {
    if (selectedPostIds.length === 0) return;
    setDeleting(true);
    try {
      let ok = 0;
      for (const postId of selectedPostIds) {
        await deletePost(postId);
        ok++;
      }
      await loadData(true, false);
      toast.success(`Deleted ${ok} post${ok === 1 ? '' : 's'}`);
      setDeleteOpen(false);
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to delete posts');
    } finally {
      setDeleting(false);
    }
  };

  const aiFailedResults = aiTask?.results.filter((result) => !result.ok && result.status === 'failed') || [];
  const aiFailureMessage = aiTask?.error || aiFailedResults[0]?.error;

  if (isLoading && !campaign) return <LoadingState label="Loading batch actions..." minHeight={400} />;
  const none = selectedPostIds.length === 0;
  const campaignEmpty = !isLoading && (counts.all || 0) === 0 && !searchQuery && statusFilter === 'all';
  const inactive = campaign?.status !== 'active';
  // Selecting across pages is offered whenever the list is longer than what is selected on this page.
  const everyMatchingSelectable = !allMatchingSelected && totalPosts > visiblePosts.length;
  const statusChips: Array<[string, string]> = [
    ['all', 'All'],
    ['draft', 'Draft'],
    ['scheduled', 'Scheduled'],
    ['queued', 'Queued'],
    ['completed', 'Posted'],
    ['failed', 'Failed'],
  ];
  const actions: Array<{ key: string; label: string; icon: string; onClick: () => void; variant?: 'filled' | 'tonal'; danger?: boolean; disabled?: boolean; title?: string }> = [
    { key: 'ai', label: 'AI Generate', icon: 'auto_awesome', onClick: () => setAiOpen(true) },
    { key: 'text', label: 'Set Text', icon: 'text_fields', onClick: () => setSetTextOpen(true) },
    { key: 'schedule', label: 'Schedule', icon: 'schedule', onClick: () => setScheduleOpen(true) },
    { key: 'unschedule', label: 'Unschedule', icon: 'event_busy', onClick: handleBatchUnschedule },
    { key: 'send', label: 'Send Now', icon: 'send', onClick: handleBatchSend, variant: 'filled', disabled: inactive || sending, title: inactive ? 'Resume the campaign to send posts' : undefined },
    { key: 'delete', label: 'Delete', icon: 'delete', onClick: () => setDeleteOpen(true), danger: true },
  ];

  return (
    <Page ref={paginationRef} density="compact">
      <PageHeader
        title="Batch Actions"
        description={
          <>
            Select posts of <strong className="text-on-surface">{campaign?.name}</strong> and act on them together.
          </>
        }
        backLink={{ to: `/campaigns/${id}`, label: 'Back to Campaign' }}
        actions={
          <Button variant="filled" icon="add" href={`/campaigns/${id}/batch/create`}>
            Create Batch
          </Button>
        }
      />
      {campaignEmpty ? (
        <EmptyState
          icon="stacks"
          shape="cookie-9"
          title="No posts to act on yet"
          description="Queue media from uploads, libraries or albums to create many posts at once."
          action={
            <Button variant="filled" icon="add" href={`/campaigns/${id}/batch/create`}>
              Create Batch
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="v2-campaign-filters">
            <ChipSet scroll aria-label="Filter by status">
              {statusChips
                .filter(([key]) => key === 'all' || (counts[key] || 0) > 0 || statusFilter === key)
                .map(([key, label]) => (
                  <FilterChip
                    key={key}
                    selected={statusFilter === key}
                    label={
                      <>
                        {label} <span className="v2-chip-count">{counts[key] || 0}</span>
                      </>
                    }
                    onClick={() => updateQuery({ status: key === 'all' ? '' : key })}
                  />
                ))}
            </ChipSet>
            <div className="v2-campaign-filters__tools">
              <SearchField value={searchQuery} onChange={(v) => updateQuery({ q: v })} placeholder="Search posts by content..." className="v2-header-search" />
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

          {aiTask && (
            <div className="v2-autotag" data-tone={aiFailureMessage ? 'warning' : undefined}>
              <Icon name={aiTask.status === 'queued' || aiTask.status === 'running' ? 'progress_activity' : 'auto_awesome'} size={18} />
              <Text as="span" variant="label-medium">
                AI text generation {aiTask.status} · {aiTask.completed} of {aiTask.total} posts processed
              </Text>
              <LinearProgress value={aiTask.total > 0 ? aiTask.completed / aiTask.total : 0} max={1} className="v2-autotag__bar" aria-label="AI text generation" />
              <Button variant="text" size="xs" onClick={() => setAiTask(null)}>
                Dismiss
              </Button>
              {aiFailureMessage && (
                <Text variant="body-small" className="w-full truncate" title={aiFailureMessage}>
                  {aiFailedResults.length} post{aiFailedResults.length === 1 ? '' : 's'} failed · {aiFailureMessage}
                </Text>
              )}
            </div>
          )}

          {visiblePosts.length === 0 && !isLoading ? (
            <EmptyState
              icon="search_off"
              title="No posts match"
              description="Try another status or search."
              action={
                <Button variant="tonal" icon="filter_alt_off" onClick={() => updateQuery({ q: '', status: '' })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="v2-batch-head">
                <label className="v2-batch-head__all">
                  <Checkbox checked={allVisibleSelected} indeterminate={!none && !allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all on this page" />
                  <Text as="span" variant="label-large">
                    {allMatchingSelected ? `All ${selectedPostIds.length} matching posts selected` : allVisibleSelected ? `All ${visiblePosts.length} on this page selected` : 'Select all on this page'}
                  </Text>
                </label>
                {everyMatchingSelectable && (
                  <Button variant="tonal" size="xs" icon="select_all" onClick={() => void selectAllMatchingPosts()}>
                    Select all {totalPosts}
                  </Button>
                )}
                <Text as="span" variant="label-medium" className="ms-auto tabular-nums text-on-surface-variant">
                  {totalPosts} {totalPosts === 1 ? 'post' : 'posts'}
                  <span className="v2-hide-mobile"> · Shift-click selects a range</span>
                </Text>
              </div>
              <RowList>
                {visiblePosts.map((post, index) => {
                  const selected = selectedPostIds.includes(post.id);
                  const mediaUrls = (post.media || []).map(mediaPreviewUrl).filter(Boolean);
                  return (
                    <Row
                      key={post.id}
                      selected={selected}
                      className="v2-batch-row"
                      onClick={(e) => toggleSelectPost(post.id, index, 'shiftKey' in e ? e.shiftKey : false)}
                      lead={
                        <span
                          className="v2-row__check"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectPost(post.id, index, e.shiftKey);
                          }}
                        >
                          <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label="Select post" />
                        </span>
                      }
                      title={
                        <span className="flex min-w-0 items-center gap-3">
                          {mediaUrls.length > 0 ? (
                            <button type="button" className="v2-batch-thumb m3-focus-ring" title={`View ${mediaUrls.length} media item${mediaUrls.length === 1 ? '' : 's'}`} onClick={() => setLightbox({ media: post.media || [], index: 0 })}>
                              <img src={mediaUrls[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
                              {mediaUrls.length > 1 && <span className="v2-transfer-strip__more">+{mediaUrls.length - 1}</span>}
                            </button>
                          ) : (
                            <span className="v2-batch-thumb v2-batch-thumb--empty" aria-hidden>
                              <Icon name="notes" size={20} />
                            </span>
                          )}
                          <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="truncate">{post.textContent?.trim() || <em className="font-normal text-on-surface-variant">No text yet</em>}</span>
                            <span className="v2-row__meta">
                              <StatusPill tone={postStatusTone(post.status)}>{postStatusLabel(post.status)}</StatusPill>
                              <span className="tabular-nums">{formatPostTime(post.scheduledAt)}</span>
                            </span>
                          </span>
                        </span>
                      }
                      actions={<IconButton icon="edit" size="xs" label="Edit post" tooltip href={`/campaigns/${id}/posts/edit/${post.id}`} />}
                    />
                  );
                })}
              </RowList>
            </>
          )}
          <PagedFooter page={page} pageSize={pageSize} total={totalPosts} pages={totalPages} onPageChange={(next) => updateQuery({ page: String(next) })} pageSizeOptions={PAGE_SIZE_OPTIONS} onPageSizeChange={(next) => updateQuery({ pageSize: String(next) })} />

          {!none && (
            <div className="v2-float-bar" role="toolbar" aria-label="Actions for selected posts">
              <IconButton
                icon="close"
                size="sm"
                label="Clear selection"
                tooltip
                onClick={() => {
                  setSelectedPostIds([]);
                  setAllMatchingSelected(false);
                }}
              />
              <Text as="span" variant="label-large" emphasized className="tabular-nums whitespace-nowrap">
                {selectedPostIds.length} selected
              </Text>
              {everyMatchingSelectable &&
                (compact ? (
                  <IconButton icon="select_all" size="sm" label={`Select all ${totalPosts}`} tooltip onClick={() => void selectAllMatchingPosts()} />
                ) : (
                  <Button variant="tonal" size="sm" icon="select_all" onClick={() => void selectAllMatchingPosts()}>
                    Select all {totalPosts}
                  </Button>
                ))}
              <span className="v2-float-bar__actions">
                {actions.map((action) =>
                  compact ? (
                    <IconButton key={action.key} icon={action.icon} size="sm" variant={action.variant} label={action.label} tooltip disabled={action.disabled} className={action.danger ? 'v2-icon-danger' : undefined} onClick={action.onClick} />
                  ) : (
                    <Button key={action.key} variant={action.variant ?? 'text'} size="sm" icon={action.icon} disabled={action.disabled} title={action.title} className={action.danger ? 'v2-button-danger' : undefined} onClick={action.onClick}>
                      {action.label}
                    </Button>
                  ),
                )}
              </span>
            </div>
          )}
        </div>
      )}

      {lightbox && <PostMediaViewer media={lightbox.media} index={lightbox.index} onIndexChange={(index) => setLightbox((c) => (c ? { ...c, index } : c))} onClose={() => setLightbox(null)} />}
      <ConfirmDialog
        open={unscheduleOpen}
        title="Confirm Batch Unschedule"
        message={`Clear the schedule on ${selectedPostIds.length} selected post${selectedPostIds.length === 1 ? '' : 's'}? They return to draft and their scheduled times are lost.`}
        confirmLabel="Unschedule"
        onClose={() => !unscheduling && setUnscheduleOpen(false)}
        onConfirm={confirmBatchUnschedule}
      />
      <ConfirmDialog
        open={sendOpen}
        title="Confirm Batch Send"
        message={
          <>
            Publish {selectedPostIds.length} selected post{selectedPostIds.length === 1 ? '' : 's'} to <strong>{campaign?.name}</strong> right now? Posts go live on the connected channels immediately and cannot be unsent.
            {sending && (
              <span className="mt-3 block">
                Sending {sendProgress} / {selectedPostIds.length}...
                <LinearProgress value={sendProgress} max={Math.max(1, selectedPostIds.length)} className="mt-2" />
              </span>
            )}
          </>
        }
        confirmLabel="Send Now"
        onClose={() => !sending && setSendOpen(false)}
        onConfirm={confirmBatchSend}
      />
      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Confirm Batch Delete"
        message={`Delete ${selectedPostIds.length} selected posts? This cannot be undone.`}
        confirmLabel="Delete Posts"
        onClose={() => !deleting && setDeleteOpen(false)}
        onConfirm={confirmBatchDelete}
      />
      {aiOpen && (
        <BatchAiGenerateDialog
          postIds={selectedPostIds}
          onClose={() => setAiOpen(false)}
          onQueued={(task) => {
            setAiTask(task);
            setAiOpen(false);
          }}
        />
      )}
      {setTextOpen && <BatchSetTextDialog postIds={selectedPostIds} onClose={() => setSetTextOpen(false)} onComplete={() => void loadData(true)} />}
      {scheduleOpen && <BatchScheduleDialog postIds={selectedPostIds} onClose={() => setScheduleOpen(false)} onComplete={() => void loadData(true)} />}
    </Page>
  );
}
