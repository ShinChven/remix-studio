import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Clock,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BatchGenerateTextResult,
  batchUnschedulePosts,
  deletePost,
  fetchCampaign,
  fetchBatchGeneratePostTextStatus,
  sendPostNow,
} from '../api';
import { BatchAiGenerateModal } from '../components/BatchAiGenerateModal';
import { BatchScheduleModal } from '../components/BatchScheduleModal';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

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

function statusLabel(status: string) {
  if (status === 'completed') return 'Posted';
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function statusClass(status: string) {
  if (status === 'draft') return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
  if (status === 'scheduled') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (status === 'completed') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  return 'bg-red-500/10 text-red-600 dark:text-red-400';
}

function mediaPreviewUrl(media: BatchPost['media'][number]) {
  const value = media.thumbnailUrl || media.processedUrl || media.sourceUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

export function CampaignBatchActions() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<BatchPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<string[] | null>(null);

  const searchQuery = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const sortKey = (searchParams.get('sort') || 'scheduled_desc') as SortKey;

  const updateQuery = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    setSearchParams(params);
  };

  const loadData = async (silent = false, preserveSelection = false) => {
    if (!id) return;
    if (!silent) setIsLoading(true);
    try {
      const data = await fetchCampaign(id);
      setCampaign(data);
      setPosts(data.posts || []);
      if (!preserveSelection) setSelectedPostIds([]);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load batch actions');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

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
          if (status.status === 'failed') {
            toast.error(status.error || `Generated ${ok}, failed ${fail}`);
          } else if (fail > 0) {
            toast.warning(`Generated ${ok}, failed ${fail}`);
          } else {
            toast.success(`Generated text for ${ok} post${ok === 1 ? '' : 's'}`);
          }
          await loadData(true, true);
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error?.message || 'Failed to refresh AI generation status');
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

  const visiblePosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return posts
      .filter((post) => statusFilter === 'all' || post.status === statusFilter)
      .filter((post) => !q || (post.textContent || '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const aCreated = new Date(a.createdAt || 0).getTime();
        const bCreated = new Date(b.createdAt || 0).getTime();
        const aScheduled = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
        const bScheduled = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
        if (sortKey === 'scheduled_asc') return aScheduled - bScheduled;
        if (sortKey === 'created_desc') return bCreated - aCreated;
        if (sortKey === 'created_asc') return aCreated - bCreated;
        return bScheduled - aScheduled;
      });
  }, [posts, searchQuery, sortKey, statusFilter]);

  const allVisibleSelected = visiblePosts.length > 0 && visiblePosts.every((post) => selectedPostIds.includes(post.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visiblePosts.map((post) => post.id));
      setSelectedPostIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      setSelectedPostIds((prev) => Array.from(new Set([...prev, ...visiblePosts.map((post) => post.id)])));
    }
  };

  const toggleSelectPost = (postId: string, index: number, shiftKey?: boolean) => {
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

  const handleBatchSend = async () => {
    if (selectedPostIds.length === 0) return;
    if (campaign?.status !== 'active') {
      toast.error('Campaign is inactive', { description: 'Activate the campaign before sending posts.' });
      return;
    }
    let ok = 0;
    let fail = 0;
    for (const postId of selectedPostIds) {
      try {
        await sendPostNow(postId);
        ok++;
      } catch {
        fail++;
      }
    }
    if (fail > 0) toast.warning(`Sent ${ok}, failed ${fail}`);
    else toast.success(`Sent ${ok} post${ok === 1 ? '' : 's'}`);
    await loadData(true);
  };

  const handleBatchUnschedule = async () => {
    if (selectedPostIds.length === 0) return;
    try {
      const result = await batchUnschedulePosts(selectedPostIds);
      if (result.skipped.length > 0) toast.warning(`Unscheduled ${result.updated}. Skipped ${result.skipped.length}.`);
      else toast.success(`Unscheduled ${result.updated} post${result.updated === 1 ? '' : 's'}`);
      await loadData(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to unschedule posts');
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
      toast.success(`Deleted ${ok} post${ok === 1 ? '' : 's'}`);
      setDeleteOpen(false);
      await loadData(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete posts');
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading && !campaign) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading batch actions...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-24">
        <PageHeader
          title="Batch Actions"
          description={<>Manage multiple posts for <span className="font-semibold text-neutral-950 dark:text-white">{campaign?.name}</span></>}
          backLink={{ to: `/campaigns/${id}`, label: 'Back to Campaign' }}
          actions={(
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95" onClick={() => navigate(`/campaigns/${id}/batch/create`)}>
              <Plus className="h-4 w-4" />
              Create Batch
            </button>
          )}
        />

        <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={searchQuery}
                onChange={(event) => updateQuery({ q: event.target.value })}
                placeholder="Search posts by content..."
                className="h-10 w-full rounded-xl border border-neutral-200/50 bg-white/40 pl-10 pr-3 text-sm font-medium shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white"
              />
            </div>
            <select value={statusFilter} onChange={(event) => updateQuery({ status: event.target.value })} className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold shadow-sm outline-none backdrop-blur-3xl focus:border-indigo-500/50 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white">
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Posted</option>
              <option value="failed">Failed</option>
            </select>
            <select value={sortKey} onChange={(event) => updateQuery({ sort: event.target.value })} className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold shadow-sm outline-none backdrop-blur-3xl focus:border-indigo-500/50 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white">
              <option value="scheduled_asc">Scheduled (Soonest First)</option>
              <option value="scheduled_desc">Scheduled (Latest First)</option>
              <option value="created_desc">Created (Newest First)</option>
              <option value="created_asc">Created (Oldest First)</option>
            </select>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-4 dark:border-white/10">
            <div className="mr-2 rounded-xl border border-neutral-200/50 bg-white/40 px-4 py-2 text-sm font-bold text-neutral-700 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200">
              {selectedPostIds.length} selected
            </div>
            <button disabled={selectedPostIds.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-4 w-4" /> AI Generate
            </button>
            <button disabled={selectedPostIds.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => setScheduleOpen(true)}>
              <Clock className="h-4 w-4" /> Schedule
            </button>
            <button disabled={selectedPostIds.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => void handleBatchUnschedule()}>
              <X className="h-4 w-4" /> Unschedule
            </button>
            <button disabled={selectedPostIds.length === 0 || campaign?.status !== 'active'} className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40" onClick={() => void handleBatchSend()}>
              <Send className="h-4 w-4" /> Send Now
            </button>
            <button disabled={selectedPostIds.length === 0} className="inline-flex h-9 items-center gap-2 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-40" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>

          {aiTask && (
            <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {aiTask.status === 'queued' || aiTask.status === 'running' ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                  ) : (
                    <Sparkles className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-neutral-950 dark:text-white">
                      AI text generation {aiTask.status}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {aiTask.completed} of {aiTask.total} posts processed
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="self-start rounded-lg px-2 py-1 text-xs font-bold text-neutral-500 transition hover:bg-white/50 hover:text-neutral-900 dark:hover:bg-white/10 dark:hover:text-white sm:self-auto"
                  onClick={() => setAiTask(null)}
                >
                  Dismiss
                </button>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${aiTask.total > 0 ? Math.round((aiTask.completed / aiTask.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-neutral-100/70 text-xs uppercase tracking-wider text-neutral-500 dark:bg-white/5 dark:text-neutral-400">
                <tr>
                  <th className="w-14 px-5 py-4">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="h-4 w-4 rounded border-neutral-300" />
                  </th>
                  <th className="px-5 py-4">Post Content</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Scheduled</th>
                  <th className="px-5 py-4">Media</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-white/10">
                {visiblePosts.map((post, index) => {
                  const selected = selectedPostIds.includes(post.id);
                  const mediaUrls = (post.media || []).map(mediaPreviewUrl).filter(Boolean);
                  return (
                    <tr key={post.id} className={cn('transition-colors', selected && 'bg-neutral-950/5 dark:bg-white/5')}>
                      <td className="px-5 py-4">
                        <input type="checkbox" checked={selected} onClick={(event) => toggleSelectPost(post.id, index, event.shiftKey)} onChange={() => {}} className="h-4 w-4 rounded border-neutral-300" />
                      </td>
                      <td className="max-w-[420px] px-5 py-4">
                        <p className="line-clamp-2 font-medium text-neutral-950 dark:text-white">{post.textContent || <span className="italic text-neutral-400">No content</span>}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={cn('inline-flex rounded-full px-2 py-1 text-xs font-bold uppercase tracking-widest', statusClass(post.status))}>
                          {statusLabel(post.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Not scheduled'}
                      </td>
                      <td className="px-5 py-4">
                        {mediaUrls.length > 0 ? (
                          <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-xs font-bold transition hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/10" onClick={() => setPreviewMedia(mediaUrls)}>
                            <ImageIcon className="h-4 w-4" /> {mediaUrls.length}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400">No media</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white" onClick={() => navigate(`/campaigns/${id}/posts/edit/${post.id}`)}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && visiblePosts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="h-60 text-center">
                      <div className="flex flex-col items-center justify-center text-neutral-500">
                        <Search className="mb-4 h-12 w-12 opacity-20" />
                        <p className="text-lg font-medium">No posts found</p>
                        <p className="text-sm opacity-70">Try adjusting filters or search query.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {previewMedia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={() => setPreviewMedia(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-neutral-200/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-950 dark:text-white">Post Media</h2>
              <button className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white" onClick={() => setPreviewMedia(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {previewMedia.map((url, index) => (
                <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-2xl bg-neutral-900">
                  <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setDeleteOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="flex items-center gap-2 text-xl font-bold text-red-600"><Trash2 className="h-5 w-5" /> Confirm Batch Delete</h2>
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Delete <strong>{selectedPostIds.length}</strong> selected posts? This cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</button>
              <button className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50" onClick={() => void confirmBatchDelete()} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete Posts
              </button>
            </div>
          </div>
        </div>
      )}

      {aiOpen && (
        <BatchAiGenerateModal
          postIds={selectedPostIds}
          onClose={() => setAiOpen(false)}
          onQueued={(task) => {
            setAiTask(task);
            setAiOpen(false);
          }}
        />
      )}
      {scheduleOpen && (
        <BatchScheduleModal
          postIds={selectedPostIds}
          onClose={() => setScheduleOpen(false)}
          onComplete={() => void loadData(true)}
        />
      )}
    </div>
  );
}
