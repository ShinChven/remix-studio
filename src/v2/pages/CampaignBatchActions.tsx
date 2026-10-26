import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { batchUnschedulePosts, deletePost, fetchBatchGeneratePostTextStatus, fetchCampaign, fetchCampaignPostIds, fetchCampaignPosts, sendPostNow, type BatchGenerateTextResult } from '../../api';
import { Button, Checkbox, Icon, IconButton, LinearProgress, Select, Text } from '../../m3';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { BatchScheduleDialog, BatchSetTextDialog } from '../components/campaigns/BatchPostDialogs';
import { PostMediaViewer } from '../components/campaigns/PostMediaViewer';
import { postStatusLabel, postStatusTone } from '../lib/posts';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
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

  const loadData = async (silent = false, preserveSelection = true) => {
    if (!id) return;
    if (!silent) setIsLoading(true);
    try {
      const [campaignData, postData] = await Promise.all([
        campaign ? Promise.resolve(campaign) : fetchCampaign(id, false),
        fetchCampaignPosts(id, { page, pageSize, q: searchQuery, status: statusFilter, sort: sortKey }),
      ]);
      setCampaign(campaignData);
      setPosts(postData.items || []);
      setTotalPosts(postData.total || 0);
      setTotalPages(postData.totalPages || 1);
      if (!preserveSelection) {
        setSelectedPostIds([]);
        setAllMatchingSelected(false);
      }
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to load batch actions');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData(false, true);
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

  return (
    <Page density="compact">
      <PageHeader
        title="Batch Actions"
        description={
          <>
            Manage multiple posts for <strong className="text-on-surface">{campaign?.name}</strong>
          </>
        }
        backLink={{ to: `/campaigns/${id}`, label: 'Back to Campaign' }}
        actions={
          <Button variant="filled" icon="add" href={`/campaigns/${id}/batch/create`}>
            Create Batch
          </Button>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={searchQuery} onChange={(v) => updateQuery({ q: v })} placeholder="Search posts by content..." className="v2-header-search" />
          <Select
            variant="outlined"
            aria-label="Status"
            leadingIcon="filter_list"
            value={statusFilter}
            onChange={(v) => updateQuery({ status: v })}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'draft', label: 'Draft' },
              { value: 'scheduled', label: 'Scheduled' },
              { value: 'completed', label: 'Posted' },
              { value: 'failed', label: 'Failed' },
            ]}
            className="v2-inline-select"
          />
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
          <Select variant="outlined" aria-label="Page size" value={String(pageSize)} onChange={(v) => updateQuery({ pageSize: v })} options={PAGE_SIZE_OPTIONS.map((o) => ({ value: String(o), label: `${o} / page` }))} className="v2-inline-select" />
        </div>

        <div className="v2-selection-bar" data-active={none ? undefined : ''}>
          <div className="v2-selection-bar__lead">
            <Checkbox checked={allVisibleSelected} indeterminate={!none && !allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all" />
            <Text as="span" variant="label-large" emphasized={!none}>
              {selectedPostIds.length} selected
            </Text>
          </div>
          <div className="v2-selection-bar__actions">
            <Button variant="text" size="xs" icon="auto_awesome" disabled={none} onClick={() => setAiOpen(true)}>
              AI Generate
            </Button>
            <Button variant="text" size="xs" icon="text_fields" disabled={none} onClick={() => setSetTextOpen(true)}>
              Set Text
            </Button>
            <Button variant="text" size="xs" icon="schedule" disabled={none} onClick={() => setScheduleOpen(true)}>
              Schedule
            </Button>
            <Button variant="text" size="xs" icon="event_busy" disabled={none} onClick={handleBatchUnschedule}>
              Unschedule
            </Button>
            <Button variant="tonal" size="xs" icon="send" disabled={none || campaign?.status !== 'active' || sending} onClick={handleBatchSend}>
              Send Now
            </Button>
            <Button variant="filled" size="xs" icon="delete" className="v2-button-danger" disabled={none} onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </div>
        </div>

        {allVisibleSelected && totalPosts > visiblePosts.length && !allMatchingSelected && (
          <div className="v2-notice">
            <Icon name="select_all" />
            <Text variant="body-small" className="flex-1">
              All {visiblePosts.length} posts on this page are selected.
            </Text>
            <Button variant="text" size="xs" onClick={() => void selectAllMatchingPosts()}>
              Select all {totalPosts} matching posts
            </Button>
          </div>
        )}
        {allMatchingSelected && (
          <div className="v2-notice">
            <Icon name="done_all" />
            <Text variant="body-small" className="flex-1">
              All {selectedPostIds.length} matching posts are selected.
            </Text>
            <Button
              variant="text"
              size="xs"
              onClick={() => {
                setSelectedPostIds([]);
                setAllMatchingSelected(false);
              }}
            >
              Clear selection
            </Button>
          </div>
        )}
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
          <EmptyState icon="search_off" title="No posts found" description="Try adjusting filters or search query." />
        ) : (
          <RowList>
            {visiblePosts.map((post, index) => {
              const selected = selectedPostIds.includes(post.id);
              const mediaUrls = (post.media || []).map(mediaPreviewUrl).filter(Boolean);
              return (
                <Row
                  key={post.id}
                  selected={selected}
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
                  title={post.textContent || <em className="text-on-surface-variant">No content</em>}
                  meta={
                    <>
                      <StatusPill tone={postStatusTone(post.status)}>{postStatusLabel(post.status)}</StatusPill>
                      <span className="tabular-nums">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Not scheduled'}</span>
                    </>
                  }
                  actions={
                    <>
                      {mediaUrls.length > 0 ? (
                        <button type="button" className="v2-batch-thumb m3-focus-ring" title={`View ${mediaUrls.length} media item${mediaUrls.length === 1 ? '' : 's'}`} onClick={() => setLightbox({ media: post.media || [], index: 0 })}>
                          <img src={mediaUrls[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          {mediaUrls.length > 1 && <span className="v2-transfer-strip__more">+{mediaUrls.length - 1}</span>}
                        </button>
                      ) : (
                        <Text as="span" variant="label-small" className="text-on-surface-variant">
                          No media
                        </Text>
                      )}
                      <IconButton icon="edit" size="xs" label="Edit post" tooltip href={`/campaigns/${id}/posts/edit/${post.id}`} />
                    </>
                  }
                />
              );
            })}
          </RowList>
        )}
        <div className="v2-paged-footer">
          <Text variant="label-medium" className="text-on-surface-variant">
            Showing {totalPosts === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalPosts)} of {totalPosts}
          </Text>
          <span className="flex items-center gap-2">
            <Text variant="label-medium" className="text-on-surface-variant">
              Page {page} / {Math.max(1, totalPages)}
            </Text>
            <Pagination page={page} pages={Math.max(1, totalPages)} onPageChange={(next) => updateQuery({ page: String(next) })} />
          </span>
        </div>
      </div>

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
