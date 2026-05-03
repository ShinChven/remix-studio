import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  Linkedin,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Twitter,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BatchGenerateTextResult,
  batchUnschedulePosts,
  deletePost,
  fetchBatchGeneratePostTextStatus,
  fetchPost,
  sendPostNow,
  updatePost,
} from '../api';
import { BatchAiGenerateModal } from '../components/BatchAiGenerateModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
}

interface PostMedia {
  id: string;
  sourceUrl?: string | null;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string;
}

interface CampaignPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  campaignId: string;
  campaign?: {
    id: string;
    name: string;
    status?: string;
    socialAccounts?: SocialAccount[];
  };
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

export function CampaignPostDetail() {
  const { campaignId, postId } = useParams<{ campaignId: string; postId: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<CampaignPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickDate, setQuickDate] = useState('');
  const [quickScheduling, setQuickScheduling] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [lightbox, setLightbox] = useState<{ media: PostMedia[]; index: number } | null>(null);

  const loadPost = async (silent = false) => {
    if (!postId) return;
    if (!silent) setLoading(true);
    try {
      setPost(await fetchPost(postId));
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load post');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPost();
  }, [postId]);

  useEffect(() => {
    if (!aiTask?.batchId || aiTask.status === 'completed' || aiTask.status === 'failed') return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      fetchBatchGeneratePostTextStatus(aiTask.batchId)
        .then(async (status) => {
          if (cancelled) return;
          setAiTask(status);
          await loadPost(true);
          if (status.status === 'completed') toast.success('Generated text for post');
          if (status.status === 'failed') toast.error(status.error || 'Failed to generate text');
        })
        .catch((error) => {
          if (!cancelled) toast.error(error?.message || 'Failed to refresh AI generation status');
        });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aiTask?.batchId, aiTask?.status]);

  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null);
      if (event.key === 'ArrowRight') {
        setLightbox((current) => current ? { ...current, index: (current.index + 1) % current.media.length } : current);
      }
      if (event.key === 'ArrowLeft') {
        setLightbox((current) => current ? { ...current, index: (current.index - 1 + current.media.length) % current.media.length } : current);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightbox]);

  const connectedAccounts = post?.campaign?.socialAccounts || [];
  const active = post?.campaign?.status === 'active';
  const backCampaignId = campaignId || post?.campaignId || post?.campaign?.id;

  const handleQuickScheduleSave = async () => {
    if (!post || !quickDate) {
      toast.error('Please select a schedule time');
      return;
    }
    try {
      setQuickSaving(true);
      await updatePost(post.id, {
        textContent: post.textContent || '',
        status: 'scheduled',
        scheduledAt: new Date(quickDate).toISOString(),
      });
      toast.success('Post scheduled');
      setQuickScheduling(false);
      setQuickDate('');
      await loadPost(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to schedule post');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleUnschedule = async () => {
    if (!post) return;
    try {
      await batchUnschedulePosts([post.id]);
      toast.success('Post unscheduled');
      await loadPost(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to unschedule post');
    }
  };

  const handleSendNow = async () => {
    if (!post) return;
    if (!active) {
      toast.error('Campaign is inactive', { description: 'Activate the campaign before sending posts.' });
      return;
    }
    try {
      setSending(true);
      const result = await sendPostNow(post.id);
      const allOk = result?.results?.every((item: any) => item.ok) ?? true;
      if (allOk) toast.success('Post published successfully');
      else toast.error('Failed to publish post', { description: result?.results?.find((item: any) => !item.ok)?.error || result?.error });
      await loadPost(true);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send post');
      await loadPost(true);
    } finally {
      setSending(false);
    }
  };

  const confirmDeletePost = async () => {
    if (!post || !backCampaignId) return;
    try {
      setDeleting(true);
      await deletePost(post.id);
      toast.success('Post deleted');
      navigate(`/campaigns/${backCampaignId}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete post');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loading && !post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading post...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <p className="font-bold text-neutral-950 dark:text-white">Post not found</p>
        {backCampaignId && <Link to={`/campaigns/${backCampaignId}`} className="text-sm font-bold underline">Back to Campaign</Link>}
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-8">
      <PageHeader
        title="Post Detail"
        description={post.campaign?.name || 'Campaign post'}
        backLink={backCampaignId ? { to: `/campaigns/${backCampaignId}`, label: 'Back to Campaign' } : undefined}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-4 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/${backCampaignId}/posts/edit/${post.id}`)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-4 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => setAiOpen(true)}>
              <Sparkles className="h-4 w-4" /> AI Generate
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-500/10 px-4 text-sm font-bold text-red-600 transition hover:bg-red-500/20" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      />

      <article className="mx-auto max-w-5xl overflow-hidden rounded-card border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
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
          </div>

          {post.textContent?.trim() && (
            <div className="whitespace-pre-wrap text-base font-medium leading-relaxed tracking-tight text-neutral-950 dark:text-white">
              {post.textContent}
            </div>
          )}

          {post.media && post.media.length > 0 && (
            <div className={cn('grid gap-1.5 overflow-hidden rounded-card border border-neutral-200 shadow-sm dark:border-white/10', post.media.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
              {post.media.map((media, index) => {
                const url = mediaUrl(media);
                const posterUrl = media.type === 'video' ? mediaPosterUrl(media) : '';
                return (
                  <button key={media.id} type="button" className="group/media relative aspect-video overflow-hidden bg-neutral-100 text-left dark:bg-neutral-800" onClick={() => setLightbox({ media: post.media || [], index })} aria-label={`Open media ${index + 1}`}>
                    {url && media.type !== 'video' ? (
                      <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                    ) : posterUrl && media.type === 'video' ? (
                      <img src={posterUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                    ) : url && media.type === 'video' ? (
                      <video src={url} className="h-full w-full object-cover object-top" muted playsInline preload="metadata" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-neutral-400">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {quickScheduling ? (
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input type="datetime-local" className="h-10 w-full rounded-card border border-neutral-200/50 bg-white/40 px-3 text-xs outline-none focus:border-indigo-500/50 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white sm:w-48" value={quickDate} onChange={(event) => setQuickDate(event.target.value)} />
                  <button className="h-10 rounded-card bg-indigo-600 px-4 text-sm font-bold text-white hover:bg-indigo-700" onClick={() => void handleQuickScheduleSave()} disabled={quickSaving}>
                    {quickSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </button>
                  <button className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10" onClick={() => setQuickScheduling(false)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button className="flex h-10 w-full items-center justify-center gap-2 rounded-card bg-indigo-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-50 sm:w-auto" onClick={() => void handleSendNow()} disabled={!active || sending}>
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {post.status === 'completed' ? 'Send Again' : 'Send Now'}
                  </button>
                  {!post.scheduledAt ? (
                    <button className="h-10 w-full rounded-full px-4 text-sm font-bold text-emerald-600 transition hover:bg-emerald-500/10 sm:w-auto" onClick={() => {
                      const defaultTime = new Date();
                      defaultTime.setHours(defaultTime.getHours() + 1);
                      setQuickDate(toDatetimeLocal(defaultTime));
                      setQuickScheduling(true);
                    }}>
                      Schedule
                    </button>
                  ) : (
                    <>
                      <button className="h-10 w-full rounded-full px-4 text-sm font-bold text-amber-600 transition hover:bg-amber-500/10 sm:w-auto" onClick={() => {
                        const defaultTime = new Date(post.scheduledAt || new Date());
                        if (Number.isNaN(defaultTime.getTime())) defaultTime.setHours(new Date().getHours() + 1);
                        setQuickDate(toDatetimeLocal(defaultTime));
                        setQuickScheduling(true);
                      }}>
                        Reschedule
                      </button>
                      <button className="h-10 w-full rounded-full px-4 text-sm font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white sm:w-auto" onClick={() => void handleUnschedule()}>
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

          {post.executions && post.executions.length > 0 && (
            <div className="grid gap-2 border-t border-neutral-200 pt-4 dark:border-white/10">
              {post.executions.map((execution) => (
                <div key={execution.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-950/60">
                  <div className="flex items-center gap-2">
                    {execution.socialAccount && <span className="text-neutral-500">{getPlatformIcon(execution.socialAccount.platform)}</span>}
                    <span className="font-bold text-neutral-900 dark:text-white">{execution.socialAccount ? displayAccountName(execution.socialAccount) : 'Channel'}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', statusClasses(execution.status))}>{statusLabel(execution.status)}</span>
                  </div>
                  {execution.externalUrl && <a href={execution.externalUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-neutral-950 underline dark:text-white">Open</a>}
                  {execution.errorMsg && <span className="text-xs font-medium text-red-500">{execution.errorMsg}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </article>

      {lightbox && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 backdrop-blur-md" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute right-5 top-5 z-[122] flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10" onClick={() => setLightbox(null)} aria-label="Close media viewer">
            <X className="h-6 w-6" />
          </button>
          {lightbox.media.length > 1 && (
            <>
              <button type="button" className="absolute left-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex" onClick={(event) => {
                event.stopPropagation();
                setLightbox((current) => current ? { ...current, index: (current.index - 1 + current.media.length) % current.media.length } : current);
              }} aria-label="Previous media">
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button type="button" className="absolute right-4 top-1/2 z-[122] hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white transition hover:bg-white/10 md:flex" onClick={(event) => {
                event.stopPropagation();
                setLightbox((current) => current ? { ...current, index: (current.index + 1) % current.media.length } : current);
              }} aria-label="Next media">
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
          <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
            {(() => {
              const item = lightbox.media[lightbox.index];
              const url = item ? mediaUrl(item) : '';
              if (!url) return <div className="text-sm font-medium text-white/70">Media is not available</div>;
              if (item.type === 'video') return <video src={url} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" controls autoPlay playsInline />;
              return <img src={url} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />;
            })()}
          </div>
        </div>
      )}

      {aiOpen && (
        <BatchAiGenerateModal
          postIds={[post.id]}
          onClose={() => setAiOpen(false)}
          onQueued={(task) => {
            setAiTask(task);
            setAiOpen(false);
            toast.success('AI generation queued');
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Post"
        description="Are you sure you want to delete this post? This action cannot be undone."
        confirmLabel={deleting ? 'Deleting...' : 'Delete Post'}
        cancelLabel="Cancel"
        confirmDisabled={deleting}
        onConfirm={() => void confirmDeletePost()}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        variant="danger"
      />
    </div>
  );
}
