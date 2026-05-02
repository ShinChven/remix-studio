import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Facebook,
  Globe,
  Image as ImageIcon,
  Instagram,
  Layers,
  Linkedin,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Twitter,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BatchGenerateTextResult,
  addPostMedia,
  batchUnschedulePosts,
  deleteCampaign,
  deletePost,
  fetchBatchGeneratePostTextStatus,
  fetchCampaign,
  fetchCampaignPosts,
  removePostMedia,
  sendPostNow,
  updateCampaign,
  updatePost,
} from '../api';
import { BatchAiGenerateModal } from '../components/BatchAiGenerateModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

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

function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'all';
}

function parseSortKey(value: string | null): SortKey {
  return SORT_KEYS.includes(value as SortKey) ? (value as SortKey) : 'scheduled_asc';
}

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
  status?: string;
}

interface PostMedia {
  id: string;
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  size?: number | null;
  type?: string;
  status?: string;
  errorMsg?: string | null;
}

interface CampaignPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  createdAt?: string;
  media?: PostMedia[];
  executions?: Array<{
    id: string;
    status: string;
    externalUrl?: string | null;
    errorMsg?: string | null;
    socialAccount?: SocialAccount;
  }>;
}

function toDatetimeLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function fallbackAvatar(id: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

function displayAccountName(account: SocialAccount) {
  return account.profileName || account.accountId || account.platform;
}

function getPlatformIcon(platform = '') {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return <Twitter className="h-4 w-4" />;
    case 'instagram':
      return <Instagram className="h-4 w-4" />;
    case 'linkedin':
      return <Linkedin className="h-4 w-4" />;
    case 'facebook':
      return <Facebook className="h-4 w-4" />;
    default:
      return <Globe className="h-4 w-4" />;
  }
}

function mediaUrl(media: PostMedia) {
  const value = media.processedUrl || media.sourceUrl || media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

function mediaPosterUrl(media: PostMedia) {
  const value = media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

function mediaFullUrl(media: PostMedia) {
  const value = media.processedUrl || media.sourceUrl || media.thumbnailUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Posted';
  if (status === 'queued') return 'Queued';
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function statusClasses(status: string) {
  if (status === 'draft') return 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300';
  if (status === 'scheduled') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  if (status === 'queued') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
  if (status === 'completed') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  return 'bg-red-500/10 text-red-600 dark:text-red-400';
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDateTime(date: Date | null) {
  if (!date) return 'Not scheduled';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<CampaignPost[]>([]);
  const [matchingPosts, setMatchingPosts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [postsLoading, setPostsLoading] = useState(true);
  const [statusCounts, setStatusCounts] = useState<Record<StatusFilter, number>>({
    all: 0,
    draft: 0,
    scheduled: 0,
    queued: 0,
    completed: 0,
    failed: 0,
  });
  const [postSummary, setPostSummary] = useState({
    mediaSize: 0,
    mediaCount: 0,
    scheduledStart: null as string | null,
    scheduledEnd: null as string | null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = parseStatusFilter(searchParams.get('status'));
  const sortKey = parseSortKey(searchParams.get('sort'));
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const pageSize = parsePageSize(searchParams.get('pageSize') || searchParams.get('limit'));

  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [postStatus, setPostStatus] = useState('draft');
  const [scheduledAt, setScheduledAt] = useState('');
  const [savingPost, setSavingPost] = useState(false);
  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaTypeInput, setMediaTypeInput] = useState('image');
  const [attachingMedia, setAttachingMedia] = useState(false);

  const [quickSchedulingId, setQuickSchedulingId] = useState<string | null>(null);
  const [quickDate, setQuickDate] = useState('');
  const [quickSavingId, setQuickSavingId] = useState<string | null>(null);
  const [sendingPostId, setSendingPostId] = useState<string | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<CampaignPost | null>(null);
  const [deleteCampaignOpen, setDeleteCampaignOpen] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [aiPostId, setAiPostId] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [lightbox, setLightbox] = useState<{ media: PostMedia[]; index: number } | null>(null);

  const updateQuery = (updates: Record<string, string>, replace = false) => {
    const params = new URLSearchParams(searchParams);
    const resetsPage = Object.keys(updates).some((key) => key !== 'page');

    for (const [key, value] of Object.entries(updates)) {
      const trimmed = value.trim();
      if (
        trimmed &&
        !(key === 'status' && trimmed === 'all') &&
        !(key === 'sort' && trimmed === 'scheduled_asc') &&
        !(key === 'pageSize' && trimmed === String(DEFAULT_PAGE_SIZE)) &&
        !(key === 'page' && trimmed === '1')
      ) {
        params.set(key, trimmed);
      } else {
        params.delete(key);
      }
    }

    if (resetsPage) {
      params.delete('page');
    }

    setSearchParams(params, { replace });
  };

  const loadCampaign = async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      const data = await fetchCampaign(id, false);
      setCampaign(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load campaign');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadPosts = async (silent = false) => {
    if (!id) return;
    if (!silent) setPostsLoading(true);
    try {
      const data = await fetchCampaignPosts(id, { page, pageSize, q: searchQuery, status: statusFilter, sort: sortKey });
      const nextTotalPages = Math.max(1, data.totalPages || 1);
      if (page > nextTotalPages) {
        updateQuery({ page: String(nextTotalPages) }, true);
        return;
      }

      setPosts(data.items || []);
      setMatchingPosts(data.total || 0);
      setTotalPages(nextTotalPages);
      setStatusCounts({
        all: data.statusCounts?.all || 0,
        draft: data.statusCounts?.draft || 0,
        scheduled: data.statusCounts?.scheduled || 0,
        queued: data.statusCounts?.queued || 0,
        completed: data.statusCounts?.completed || 0,
        failed: data.statusCounts?.failed || 0,
      });
      setPostSummary({
        mediaSize: data.summary?.mediaSize || 0,
        mediaCount: data.summary?.mediaCount || 0,
        scheduledStart: data.summary?.scheduledStart || null,
        scheduledEnd: data.summary?.scheduledEnd || null,
      });
      setError(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load campaign posts');
    } finally {
      if (!silent) setPostsLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaign();
  }, [id]);

  useEffect(() => {
    const rawPageSize = searchParams.get('pageSize');
    const legacyLimit = searchParams.get('limit');
    const pageSizeParam = rawPageSize || legacyLimit;
    if (!pageSizeParam) return;

    const normalizedPageSize = parsePageSize(pageSizeParam);
    if (rawPageSize === String(normalizedPageSize) && !legacyLimit) return;

    const params = new URLSearchParams(searchParams);
    params.delete('limit');
    params.delete('page');
    if (normalizedPageSize === DEFAULT_PAGE_SIZE) {
      params.delete('pageSize');
    } else {
      params.set('pageSize', String(normalizedPageSize));
    }
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    void loadPosts();
  }, [id, page, pageSize, searchQuery, statusFilter, sortKey]);

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
          await loadPosts(true);
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
          await loadPosts(true);
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

  useEffect(() => {
    if (!composerOpen || !editingPostId) return;
    const currentPost = posts.find((post) => post.id === editingPostId);
    const hasPendingMedia = currentPost?.media?.some((media: PostMedia) => media.status === 'pending' || media.status === 'processing');
    if (!hasPendingMedia) return;

    const timer = window.setInterval(() => void loadPosts(true), 3000);
    return () => window.clearInterval(timer);
  }, [composerOpen, editingPostId, posts]);

  const connectedAccounts: SocialAccount[] = campaign?.socialAccounts || [];
  const active = campaign?.status === 'active';
  const counts = statusCounts;

  useEffect(() => {
    if (!lightbox) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightbox(null);
        return;
      }
      if (event.key === 'ArrowRight') {
        setLightbox((current) => {
          if (!current) return current;
          return { ...current, index: (current.index + 1) % current.media.length };
        });
      }
      if (event.key === 'ArrowLeft') {
        setLightbox((current) => {
          if (!current) return current;
          return { ...current, index: (current.index - 1 + current.media.length) % current.media.length };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox]);

  const openEditPostModal = (post: CampaignPost) => {
    navigate(`/campaigns/${id}/posts/edit/${post.id}`);
  };

  const openNewPostModal = async () => {
    navigate(`/campaigns/${id}/posts/new`);
  };

  const handleSavePost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPostId) return;

    const currentPost = posts.find((post) => post.id === editingPostId);
    const hasPendingMedia = currentPost?.media?.some((media) => media.status === 'pending' || media.status === 'processing');
    if (hasPendingMedia) {
      toast.error('Please wait for media processing to complete.');
      return;
    }

    if (postStatus === 'scheduled') {
      if (!scheduledAt) {
        toast.error('Please select a schedule time');
        return;
      }
      const selectedDate = new Date(scheduledAt);
      if (selectedDate < new Date(Date.now() + 5 * 60_000)) {
        toast.error('Scheduled time must be at least 5 minutes in the future.');
        return;
      }
    }

    try {
      setSavingPost(true);
      await updatePost(editingPostId, {
        textContent,
        status: postStatus,
        scheduledAt: postStatus === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
      });
      toast.success('Post saved successfully');
      setComposerOpen(false);
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save post');
    } finally {
      setSavingPost(false);
    }
  };

  const handleAttachMedia = async () => {
    if (!editingPostId || !mediaUrlInput.trim()) return;
    try {
      setAttachingMedia(true);
      await addPostMedia(editingPostId, { sourceUrl: mediaUrlInput.trim(), type: mediaTypeInput });
      setMediaUrlInput('');
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to attach media');
    } finally {
      setAttachingMedia(false);
    }
  };

  const handleRemoveMedia = async (mediaId: string) => {
    try {
      await removePostMedia(mediaId);
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove media');
    }
  };

  const handleQuickScheduleSave = async (post: CampaignPost) => {
    if (!quickDate) {
      toast.error('Please select a schedule time');
      return;
    }
    try {
      setQuickSavingId(post.id);
      await updatePost(post.id, {
        textContent: post.textContent || '',
        status: 'scheduled',
        scheduledAt: new Date(quickDate).toISOString(),
      });
      toast.success('Post scheduled');
      setQuickSchedulingId(null);
      setQuickDate('');
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to schedule post');
    } finally {
      setQuickSavingId(null);
    }
  };

  const handleUnschedule = async (postId: string) => {
    try {
      await batchUnschedulePosts([postId]);
      toast.success('Post unscheduled');
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to unschedule post');
    }
  };

  const handleSendNow = async (postId: string) => {
    if (!active) {
      toast.error('Campaign is inactive', { description: 'Activate the campaign before sending posts.' });
      return;
    }
    try {
      setSendingPostId(postId);
      const result = await sendPostNow(postId);
      const allOk = result?.results?.every((r: any) => r.ok) ?? true;
      if (allOk) {
        toast.success('Post published successfully');
      } else {
        const firstError = result?.results?.find((r: any) => !r.ok)?.error || result?.error || 'Publish failed';
        toast.error('Failed to publish post', { description: firstError });
      }
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send post');
      await loadPosts(true);
    } finally {
      setSendingPostId(null);
    }
  };

  const confirmDeletePost = async () => {
    if (!deletePostTarget) return;
    try {
      await deletePost(deletePostTarget.id);
      toast.success('Post deleted');
      setDeletePostTarget(null);
      await loadPosts(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete post');
    }
  };

  const toggleCampaignStatus = async () => {
    if (!campaign || !id) return;
    const nextStatus = active ? 'archived' : 'active';
    try {
      await updateCampaign(id, { status: nextStatus });
      setCampaign({ ...campaign, status: nextStatus });
      toast.success(nextStatus === 'active' ? 'Campaign resumed' : 'Campaign paused');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update campaign');
    }
  };

  const handleDeleteCampaign = async () => {
    if (!id) return;
    try {
      setDeletingCampaign(true);
      await deleteCampaign(id);
      toast.success('Campaign deleted');
      navigate('/campaigns');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete campaign');
    } finally {
      setDeletingCampaign(false);
      setDeleteCampaignOpen(false);
    }
  };

  if (loading && !campaign) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading campaign details...</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 text-neutral-500">
          <AlertCircle className="h-10 w-10 text-red-500" />
          <p className="text-lg font-bold text-neutral-950 dark:text-white">{error || 'Campaign not found'}</p>
          <button onClick={() => navigate('/campaigns')} className="text-neutral-950 underline dark:text-white">Back to Campaigns</button>
        </div>
      </div>
    );
  }

  const totalPosts = counts.all;
  const progress = totalPosts > 0 ? Math.round((counts.completed / totalPosts) * 100) : 0;
  const totalMediaSize = postSummary.mediaSize;
  const totalMediaCount = postSummary.mediaCount;
  const campaignStartDate = postSummary.scheduledStart ? new Date(postSummary.scheduledStart) : null;
  const campaignEndDate = postSummary.scheduledEnd ? new Date(postSummary.scheduledEnd) : null;
  const currentEditingPost = posts.find((post) => post.id === editingPostId);
  const currentHasPendingMedia = currentEditingPost?.media?.some((media) => media.status === 'pending' || media.status === 'processing');

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={(
            <span className="inline-flex items-center gap-2">
              {campaign.name}
              <span className={cn('inline-flex h-6 items-center rounded-full border px-2 text-xs font-bold', active ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
                {active ? 'Active' : 'Inactive'}
              </span>
            </span>
          )}
          description={campaign.description || 'No description provided.'}
          backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                placeholder="Search posts..."
                className="h-10 w-full rounded-card border border-neutral-200/50 bg-white/40 pl-10 pr-3 text-sm font-medium text-neutral-950 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-900/40 dark:text-white sm:w-64"
                value={searchQuery}
                onChange={(event) => updateQuery({ q: event.target.value }, true)}
              />
            </div>
            <select
              value={sortKey}
              onChange={(event) => updateQuery({ sort: event.target.value })}
              className="h-10 rounded-card border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200"
            >
              <option value="scheduled_asc">Scheduled (Soonest First)</option>
              <option value="scheduled_desc">Scheduled (Latest First)</option>
              <option value="created_desc">Created (Newest First)</option>
              <option value="created_asc">Created (Oldest First)</option>
            </select>
            <button className="flex h-10 w-10 items-center justify-center rounded-card border border-neutral-200/50 bg-white/40 text-neutral-700 shadow-sm transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/edit/${campaign.id}`)} title="Settings">
              <Settings className="h-4 w-4" />
            </button>
            <button className="flex h-10 w-10 items-center justify-center rounded-card border border-neutral-200/50 bg-white/40 text-neutral-700 shadow-sm transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/${campaign.id}/batch`)} title="Batch Actions">
              <Layers className="h-4 w-4" />
            </button>
            <button className="flex h-10 w-10 items-center justify-center rounded-card border border-indigo-700 bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95" onClick={openNewPostModal} title="Add Post">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          )}
        />

        <div className="grid gap-6 lg:grid-cols-4">
          <aside className="space-y-6 lg:col-span-1">
            <section className="rounded-card border border-neutral-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Campaign Progress</h2>
              <div className="mt-4 text-3xl font-bold text-indigo-600 dark:text-indigo-400">{progress}%</div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                <div className="h-full bg-indigo-600" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 mb-4 text-xs text-neutral-500 dark:text-neutral-400">{counts.completed} of {totalPosts} posts published</p>

              <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                {([
                  ['all', 'Total', counts.all],
                  ['draft', 'Draft', counts.draft],
                  ['scheduled', 'Scheduled', counts.scheduled],
                  ['completed', 'Posted', counts.completed],
                  ['failed', 'Failed', counts.failed],
                ] as Array<[StatusFilter, string, number]>).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateQuery({ status: statusFilter === key && key !== 'all' ? 'all' : key })}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-lg border p-2 transition-all',
                      key === 'all' && 'col-span-2',
                      statusFilter === key ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'border-neutral-200/50 bg-neutral-100/40 text-neutral-600 hover:bg-neutral-100 dark:border-white/5 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10',
                    )}
                  >
                    <span className="text-lg font-bold">{count}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-80">{label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={cn(
                  'mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border font-bold transition',
                  active
                    ? 'border-neutral-200/50 bg-white/40 text-neutral-700 hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10'
                    : 'border-indigo-700 bg-indigo-600 text-white hover:bg-indigo-700',
                )}
                onClick={() => void toggleCampaignStatus()}
              >
                {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {active ? 'Pause Campaign' : 'Resume Campaign'}
              </button>
            </section>

            <section className="overflow-hidden rounded-card border border-neutral-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Campaign Info</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Start Date</span>
                  <span className="text-right font-medium text-neutral-950 dark:text-white">{formatDateTime(campaignStartDate)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">End Date</span>
                  <span className="text-right font-medium text-neutral-950 dark:text-white">{formatDateTime(campaignEndDate)}</span>
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Media Storage</span>
                  <span className="text-right font-medium text-neutral-950 dark:text-white">
                    {formatBytes(totalMediaSize)}
                    <span className="ml-1 text-xs font-normal text-neutral-500">({totalMediaCount})</span>
                  </span>
                </div>
                <div className="h-px bg-neutral-200 dark:bg-white/10" />
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Connected Channels</p>
                  <div className="space-y-2">
                    {connectedAccounts.map((account) => (
                      <div key={account.id} className={cn('flex items-center justify-between rounded-lg border p-2 transition-all', account.status === 'active' || !account.status ? 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/5' : 'border-neutral-200 bg-neutral-50 opacity-60 grayscale dark:border-white/10 dark:bg-white/5')}>
                        <div className="flex min-w-0 items-center gap-2">
                          <img src={account.avatarUrl || fallbackAvatar(account.id)} alt="" referrerPolicy="no-referrer" className="h-6 w-6 shrink-0 rounded-full border object-cover dark:border-white/10" />
                          <span className="max-w-[120px] truncate text-xs font-medium text-neutral-950 dark:text-white">{displayAccountName(account)}</span>
                        </div>
                        <div className="shrink-0 text-neutral-500 dark:text-neutral-400">{getPlatformIcon(account.platform)}</div>
                      </div>
                    ))}
                    {connectedAccounts.length === 0 && <p className="text-xs italic text-neutral-500 dark:text-neutral-400">No channels connected.</p>}
                  </div>
                </div>
                <div className="h-px bg-neutral-200 dark:bg-white/10" />
                <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-500/20" onClick={() => setDeleteCampaignOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  Delete Campaign
                </button>
              </div>
            </section>
          </aside>

          <main className="space-y-6 lg:col-span-3">
            <div className="space-y-8">
              {postsLoading && (
                <div className="flex items-center justify-center rounded-card border border-neutral-200/50 bg-white/50 py-10 text-sm font-bold text-neutral-500 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/50 dark:text-neutral-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading posts...
                </div>
              )}

              {!postsLoading && posts.map((post) => (
                <article key={post.id} className="group overflow-hidden rounded-card border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-xl dark:border-white/5 dark:bg-neutral-900/70 dark:hover:bg-neutral-800/80">
                  <div className="space-y-6 p-4 sm:p-6 lg:p-8">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-4">
                        {connectedAccounts.length > 0 && (
                          <div className="flex -space-x-3">
                            {connectedAccounts.map((account) => (
                              <img key={account.id} src={account.avatarUrl || fallbackAvatar(account.id)} alt={displayAccountName(account)} referrerPolicy="no-referrer" className="h-10 w-10 rounded-full border border-neutral-200 bg-neutral-100 object-cover ring-4 ring-white dark:border-white/10 dark:bg-neutral-800 dark:ring-neutral-900" />
                            ))}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-bold tracking-tight text-neutral-950 dark:text-white">
                              {connectedAccounts.length} {connectedAccounts.length === 1 ? 'Channel' : 'Channels'}
                            </span>
                            <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-bold uppercase tracking-widest', statusClasses(post.status))}>
                              {post.status === 'processing' && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                              {statusLabel(post.status)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                            <Clock className="h-3 w-3" />
                            {post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : 'Not scheduled'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 self-end transition-all duration-300 sm:self-auto sm:opacity-0 sm:group-hover:opacity-100">
                        <button className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white" title="Edit Post" onClick={() => openEditPostModal(post)}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-950 hover:bg-neutral-100 dark:text-white dark:hover:bg-white/10" title="AI Generate" onClick={() => setAiPostId(post.id)}>
                          <Sparkles className="h-4 w-4" />
                        </button>
                        <button className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-red-500/10 hover:text-red-600" title="Delete Post" onClick={() => setDeletePostTarget(post)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Link to={`/campaigns/${id}/posts/edit/${post.id}`} className="block whitespace-pre-wrap text-base font-medium leading-relaxed tracking-tight text-neutral-950 transition hover:text-neutral-700 dark:text-white dark:hover:text-neutral-300">
                        {post.textContent || 'Empty Post Content'}
                      </Link>
                      {post.media && post.media.length > 0 && (
                        <div className={cn('grid gap-1.5 overflow-hidden rounded-card border border-neutral-200 shadow-sm dark:border-white/10', post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                          {post.media.slice(0, 4).map((media, index) => {
                            const url = mediaUrl(media);
                            const posterUrl = media.type === 'video' ? mediaPosterUrl(media) : '';
                            return (
                              <button
                                key={media.id}
                                type="button"
                                className="group/media relative aspect-video overflow-hidden bg-neutral-100 text-left dark:bg-neutral-800"
                                onClick={() => setLightbox({ media: post.media || [], index })}
                                aria-label={`Open media ${index + 1}`}
                              >
                                {url && media.type !== 'video' ? (
                                  <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                                ) : posterUrl && media.type === 'video' ? (
                                  <img src={posterUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                                ) : url && media.type === 'video' ? (
                                  <video src={mediaFullUrl(media)} className="h-full w-full object-cover object-top" muted playsInline preload="metadata" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-neutral-400">
                                    <ImageIcon className="h-6 w-6" />
                                  </div>
                                )}
                                {post.media!.length > 4 && index === 3 && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xl font-bold text-white">+{post.media!.length - 4}</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {quickSchedulingId === post.id ? (
                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            <input
                              type="datetime-local"
                              className="h-10 w-full rounded-card border border-neutral-200/50 bg-white/40 px-3 text-xs outline-none focus:border-indigo-500/50 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white sm:w-48"
                              value={quickDate}
                              onChange={(event) => setQuickDate(event.target.value)}
                            />
                            <button className="h-10 rounded-card bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700" onClick={() => void handleQuickScheduleSave(post)} disabled={quickSavingId === post.id}>
                              {quickSavingId === post.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                            </button>
                            <button className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10" onClick={() => setQuickSchedulingId(null)}>
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button className="flex h-10 w-full items-center justify-center gap-2 rounded-card bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-50 sm:w-auto" onClick={() => void handleSendNow(post.id)} disabled={!active || sendingPostId === post.id}>
                              {sendingPostId === post.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              {post.status === 'completed' ? 'Send Again' : 'Send Now'}
                            </button>
                            {!post.scheduledAt ? (
                              <button
                                className="h-10 w-full rounded-full px-4 text-sm font-bold text-emerald-600 transition hover:bg-emerald-500/10 sm:w-auto"
                                onClick={() => {
                                  const defaultTime = new Date();
                                  defaultTime.setHours(defaultTime.getHours() + 1);
                                  setQuickDate(toDatetimeLocal(defaultTime));
                                  setQuickSchedulingId(post.id);
                                }}
                              >
                                Schedule
                              </button>
                            ) : (
                              <>
                                <button
                                  className="h-10 w-full rounded-full px-4 text-sm font-bold text-amber-600 transition hover:bg-amber-500/10 sm:w-auto"
                                  onClick={() => {
                                    const defaultTime = new Date(post.scheduledAt || new Date());
                                    if (Number.isNaN(defaultTime.getTime())) defaultTime.setHours(new Date().getHours() + 1);
                                    setQuickDate(toDatetimeLocal(defaultTime));
                                    setQuickSchedulingId(post.id);
                                  }}
                                >
                                  Reschedule
                                </button>
                                <button className="h-10 w-full rounded-full px-4 text-sm font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white sm:w-auto" onClick={() => void handleUnschedule(post.id)}>
                                  Unschedule
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>

                      {post.status === 'completed' ? (
                        <div className="flex items-center gap-4 self-start sm:self-auto">
                          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Published
                          </div>
                          {post.executions?.find((execution) => execution.externalUrl)?.externalUrl && (
                            <a href={post.executions.find((execution) => execution.externalUrl)?.externalUrl || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-950 transition hover:text-neutral-600 dark:text-white dark:hover:text-neutral-300">
                              View Post <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 self-start rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300 sm:self-auto">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {statusLabel(post.status)}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}

              {!postsLoading && posts.length === 0 && (
                <div className="rounded-card border-2 border-dashed border-neutral-200 bg-white/40 py-12 text-center shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40">
                  <p className="text-neutral-500 dark:text-neutral-400">No posts found in this campaign.</p>
                  <button className="mt-2 text-sm font-bold text-neutral-950 underline dark:text-white" onClick={openNewPostModal}>Create your first post</button>
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-card border border-neutral-200/50 bg-white/70 px-5 py-4 text-sm font-medium text-neutral-500 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 dark:text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    Showing {matchingPosts === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, matchingPosts)} of {matchingPosts}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(event) => updateQuery({ pageSize: event.target.value })}
                    className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-bold text-neutral-700 outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-200"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option} / page</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || postsLoading}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 font-bold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10"
                    onClick={() => updateQuery({ page: String(page - 1) })}
                  >
                    Previous
                  </button>
                  <span className="px-2 text-xs font-black uppercase tracking-widest">
                    Page {page} / {Math.max(1, totalPages)}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || postsLoading}
                    className="rounded-lg border border-neutral-200 px-3 py-1.5 font-bold text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10"
                    onClick={() => updateQuery({ page: String(page + 1) })}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md" onClick={() => setLightbox(null)}>
          <button
            type="button"
            className="absolute right-5 top-5 z-[122] flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            onClick={() => setLightbox(null)}
            aria-label="Close media viewer"
          >
            <X className="h-6 w-6" />
          </button>

          {lightbox.media.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightbox((current) => current ? { ...current, index: (current.index - 1 + current.media.length) % current.media.length } : current);
                }}
                aria-label="Previous media"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex"
                onClick={(event) => {
                  event.stopPropagation();
                  setLightbox((current) => current ? { ...current, index: (current.index + 1) % current.media.length } : current);
                }}
                aria-label="Next media"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}

          <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            {(() => {
              const item = lightbox.media[lightbox.index];
              const url = item ? mediaFullUrl(item) : '';
              if (!url) {
                return <div className="text-sm font-medium text-white/70">Media is not available</div>;
              }
              if (item.type === 'video') {
                return <video src={url} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" controls autoPlay playsInline />;
              }
              return <img src={url} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />;
            })()}
          </div>

          {lightbox.media.length > 1 && (
            <div className="absolute bottom-6 left-1/2 z-[122] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-2 text-xs font-bold text-white/80 backdrop-blur">
              {lightbox.index + 1} / {lightbox.media.length}
            </div>
          )}
        </div>
      )}

      {composerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md sm:p-6">
          <div className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-neutral-200/50 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95">
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <h2 className="mb-8 text-xl font-bold tracking-tight text-neutral-950 dark:text-white">Composer</h2>

              <div className="mb-8">
                <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Media Attachments</label>
                {currentEditingPost?.media && currentEditingPost.media.length > 0 && (
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {currentEditingPost.media.map((media) => {
                      const url = mediaUrl(media);
                      const posterUrl = media.type === 'video' ? mediaPosterUrl(media) : '';
                      return (
                        <div key={media.id} className="group relative aspect-square overflow-hidden rounded-card border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-950">
                          {(media.status === 'pending' || media.status === 'processing') && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                              <Loader2 className="mb-2 h-6 w-6 animate-spin text-white" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-white">{media.status}</span>
                            </div>
                          )}
                          {media.status === 'failed' && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-red-500/20 backdrop-blur-sm">
                              <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
                              <span className="px-2 text-center text-[10px] font-black uppercase leading-tight tracking-widest text-red-500">Failed to process</span>
                            </div>
                          )}
                          {url && media.type !== 'video' ? (
                            <img src={url} alt="Attached media" className="h-full w-full object-cover object-top" />
                          ) : posterUrl && media.type === 'video' ? (
                            <img src={posterUrl} alt="Attached video" className="h-full w-full object-cover object-top" />
                          ) : (
                            <ImageIcon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-neutral-400" />
                          )}
                          <button className="absolute right-2 top-2 z-20 rounded-lg bg-black/50 p-1.5 text-white opacity-0 transition-all hover:bg-red-500 group-hover:opacity-100" onClick={() => void handleRemoveMedia(media.id)}>
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {(!currentEditingPost?.media || currentEditingPost.media.length < 4) && (
                  <div className="flex gap-2">
                    <select value={mediaTypeInput} onChange={(event) => setMediaTypeInput(event.target.value)} className="rounded-card border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-bold outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-white">
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="gif">GIF</option>
                    </select>
                    <input value={mediaUrlInput} onChange={(event) => setMediaUrlInput(event.target.value)} placeholder="Paste S3 key or URL..." className="min-w-0 flex-1 rounded-card border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-white" />
                    <button onClick={() => void handleAttachMedia()} disabled={attachingMedia || !mediaUrlInput.trim()} className="flex items-center gap-2 rounded-card bg-neutral-200 px-4 py-2 font-bold text-neutral-700 transition hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300">
                      {attachingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Add
                    </button>
                  </div>
                )}
              </div>

              <form onSubmit={handleSavePost} className="space-y-6">
                <div>
                  <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Text Content</label>
                  <textarea value={textContent} onChange={(event) => setTextContent(event.target.value)} rows={6} className={cn('w-full resize-none rounded-card border bg-neutral-50 px-5 py-4 text-sm font-medium text-neutral-950 shadow-inner outline-none transition dark:bg-black/20 dark:text-white', textContent.length > 280 ? 'border-red-500/50 focus:border-red-500/80' : 'border-neutral-200 focus:border-neutral-950 dark:border-white/10')} placeholder="What's happening?" autoFocus />
                  <div className="mt-2 flex justify-end">
                    <span className={cn('text-[10px] font-black uppercase tracking-widest', textContent.length > 280 ? 'text-red-500' : textContent.length > 250 ? 'text-orange-500' : 'text-neutral-400')}>
                      {textContent.length} / 280
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-neutral-500">Action</label>
                    <select value={postStatus} onChange={(event) => setPostStatus(event.target.value)} className="w-full rounded-card border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-950 outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-white">
                      <option value="draft">Save as Draft</option>
                      <option value="scheduled">Schedule for Later</option>
                    </select>
                  </div>
                  <div className={cn('transition-opacity duration-300', postStatus === 'scheduled' ? 'opacity-100' : 'pointer-events-none opacity-40')}>
                    <label className="mb-3 flex justify-between text-[10px] font-black uppercase tracking-widest text-neutral-500">
                      <span>Publish Time</span>
                      <span className="font-medium lowercase text-neutral-950 dark:text-white">Local Time</span>
                    </label>
                    <input type="datetime-local" required={postStatus === 'scheduled'} disabled={postStatus !== 'scheduled'} value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="w-full rounded-card border border-neutral-200 bg-white px-4 py-3.5 text-sm font-bold text-neutral-950 outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-white" />
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-3 border-t border-neutral-200 pt-6 dark:border-white/10">
                  <button type="button" onClick={() => { setComposerOpen(false); void loadPosts(true); }} className="rounded-card px-4 py-2 text-sm font-bold text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white">
                    Close
                  </button>
                  <button type="submit" disabled={savingPost || textContent.length > 280 || currentHasPendingMedia} className="flex items-center gap-2 rounded-card border border-indigo-700 bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {savingPost && <Loader2 className="h-4 w-4 animate-spin" />}
                    {postStatus === 'scheduled' ? 'Schedule Post' : 'Save Draft'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deletePostTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setDeletePostTarget(null)}>
          <div className="w-full max-w-md rounded-card border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Delete Post</h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Are you sure you want to delete this post? This action cannot be undone.</p>
            <p className="mt-4 line-clamp-3 border-l-2 pl-3 text-sm italic text-neutral-500">"{deletePostTarget.textContent || 'Empty Post Content'}"</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10" onClick={() => setDeletePostTarget(null)}>Cancel</button>
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700" onClick={() => void confirmDeletePost()}>Delete Post</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteCampaignOpen}
        title="Delete Campaign"
        description={`Delete ${campaign.name}? This cannot be undone and will delete all associated posts.`}
        confirmLabel={deletingCampaign ? 'Deleting...' : 'Delete Campaign'}
        cancelLabel="Cancel"
        confirmDisabled={deletingCampaign}
        onConfirm={() => void handleDeleteCampaign()}
        onCancel={() => {
          if (!deletingCampaign) setDeleteCampaignOpen(false);
        }}
        variant="danger"
      />

      {aiPostId && (
        <BatchAiGenerateModal
          postIds={[aiPostId]}
          onClose={() => setAiPostId(null)}
          onQueued={(task) => {
            setAiTask(task);
            setAiPostId(null);
          }}
        />
      )}
    </div>
  );
}
