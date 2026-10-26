import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { batchUnschedulePosts, deletePost, fetchBatchGeneratePostTextStatus, fetchPost, sendPostNow, updatePost, type BatchGenerateTextResult } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { resourceRef } from '../../lib/resource-ref';
import { Button, Icon, IconButton, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { mediaFullUrl, mediaPosterUrl, PostMediaViewer, type ViewerMedia } from '../components/campaigns/PostMediaViewer';
import { CopyRefButton } from '../components/CopyRefButton';
import { PlatformIcon } from '../lib/platform';
import { postStatusLabel, postStatusTone, toDatetimeLocal } from '../lib/posts';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
}

interface CampaignPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  campaignId: string;
  campaign?: { id: string; name: string; status?: string; socialAccounts?: SocialAccount[] };
  media?: Array<ViewerMedia & { id: string }>;
  executions?: Array<{ id: string; status: string; externalUrl?: string | null; errorMsg?: string | null; socialAccount?: SocialAccount }>;
}

const displayAccountName = (account: SocialAccount) => account.profileName || account.accountId || account.platform;

/** One campaign post: its text and media, where it was published, and send, schedule and AI text. */
export function CampaignPostDetail() {
  const { campaignId, postId } = useParams<{ campaignId: string; postId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [post, setPost] = useState<CampaignPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [quickDate, setQuickDate] = useState('');
  const [quickScheduling, setQuickScheduling] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTask, setAiTask] = useState<BatchGenerateTextResult | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const loadPost = async (silent = false) => {
    if (!postId) return;
    if (!silent) setLoading(true);
    try {
      setPost(await fetchPost(postId));
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to load post');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // The post changed elsewhere (another tab, an MCP agent, the scheduler); batch changes name no post, so they match too.
  useLiveRefresh(
    (event) => (event.resource === 'post' ? (event.id ? event.id === postId : !event.campaignId || event.campaignId === campaignId) : event.resource === 'campaign' && event.id === campaignId),
    async (events) => {
      if (events.some((event) => event.resource === 'post' && event.action === 'deleted' && event.id === postId)) {
        setPost(null);
        return;
      }
      await loadPost(true);
    },
  );

  useEffect(() => {
    if (!aiTask?.batchId || aiTask.status === 'completed' || aiTask.status === 'failed') return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      fetchBatchGeneratePostTextStatus(aiTask.batchId)
        .then(async (status) => {
          if (cancelled) return;
          setAiTask(status);
          await loadPost(true);
          const failure = status.error || status.results.find((r) => !r.ok)?.error;
          if (status.status === 'completed' && failure) toast.info(`Post text generation finished with an error · ${failure}`);
          else if (status.status === 'completed') toast.success('Generated text for post');
          if (status.status === 'failed') toast.error(failure || 'Failed to generate text');
        })
        .catch((error) => {
          if (!cancelled) toast.error(error?.message || 'Failed to refresh AI generation status');
        });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTask?.batchId, aiTask?.status]);

  const accounts = post?.campaign?.socialAccounts || [];
  const active = post?.campaign?.status === 'active';
  const backCampaignId = campaignId || post?.campaignId || post?.campaign?.id;

  const quickSchedule = async () => {
    if (!post || !quickDate) {
      toast.error('Please select a schedule time');
      return;
    }
    try {
      setQuickSaving(true);
      await updatePost(post.id, { textContent: post.textContent || '', status: 'scheduled', scheduledAt: new Date(quickDate).toISOString() });
      toast.success('Post scheduled');
      setQuickScheduling(false);
      setQuickDate('');
      await loadPost(true);
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to schedule post');
    } finally {
      setQuickSaving(false);
    }
  };

  const unschedule = async () => {
    if (!post) return;
    try {
      await batchUnschedulePosts([post.id]);
      toast.success('Post unscheduled');
      await loadPost(true);
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to unschedule post');
    }
  };

  if (loading && !post) return <LoadingState label="Loading post..." minHeight={400} />;
  if (!post) {
    return (
      <EmptyState
        icon="error"
        title="Post not found"
        action={
          backCampaignId && (
            <Button variant="tonal" icon="arrow_back" href={`/campaigns/${backCampaignId}`}>
              Back to Campaign
            </Button>
          )
        }
      />
    );
  }

  const externalUrl = post.executions?.find((e) => e.externalUrl)?.externalUrl;
  const sendMessage =
    post.status === 'completed'
      ? `This post was already published${accounts.length > 0 ? ` to ${accounts.length} channel${accounts.length === 1 ? '' : 's'}` : ''}. Sending it again posts a duplicate that cannot be unsent.`
      : `Publish this post${accounts.length > 0 ? ` to ${accounts.length} connected channel${accounts.length === 1 ? '' : 's'}` : ''} right now? It goes live immediately and cannot be unsent.`;

  return (
    <Page width="default" density="compact">
      <PageHeader
        title="Post Detail"
        description={post.campaign?.name || 'Campaign post'}
        backLink={backCampaignId ? { to: `/campaigns/${backCampaignId}`, label: 'Back to Campaign' } : undefined}
        actions={
          <>
            <CopyRefButton reference={resourceRef.post(post.campaignId, post.id)} size="sm" variant="tonal" />
            <Button variant="tonal" icon="edit" href={`/campaigns/${backCampaignId}/posts/edit/${post.id}`}>
              Edit
            </Button>
            <Button variant="tonal" icon="auto_awesome" onClick={() => setAiOpen(true)}>
              AI Generate
            </Button>
            <Button variant="text" icon="delete" className="v2-button-danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          </>
        }
      />
      <article className="v2-post-card">
        <header className="flex flex-wrap items-center gap-3">
          {accounts.length > 0 && (
            <span className="v2-avatar-stack">
              {accounts.map((a) => (
                <AccountAvatar key={a.id} account={{ ...a, platform: undefined }} size={32} refreshOn={['twitter', 'x', 'threads']} />
              ))}
            </span>
          )}
          <div className="flex flex-col">
            <span className="flex items-center gap-2">
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
        </header>
        {post.textContent?.trim() && (
          <Text variant="body-large" className="whitespace-pre-wrap">
            {post.textContent}
          </Text>
        )}
        {post.media && post.media.length > 0 && (
          <div className="v2-post-detail__media">
            {post.media.map((media, index) => {
              const url = mediaFullUrl(media);
              const poster = media.type === 'video' ? mediaPosterUrl(media) : '';
              return (
                <button key={media.id} type="button" className="v2-post-card__thumb m3-focus-ring" aria-label={`Open media ${index + 1}`} onClick={() => setViewer(index)}>
                  {url && media.type !== 'video' ? <img src={url} alt="" referrerPolicy="no-referrer" /> : poster ? <img src={poster} alt="" referrerPolicy="no-referrer" /> : url ? <video src={url} muted playsInline preload="metadata" /> : <Icon name="image" />}
                  {media.type === 'video' && (
                    <span className="v2-tile__overlay">
                      <Icon name="play_arrow" filled />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {quickScheduling ? (
              <>
                <TextField variant="outlined" type="datetime-local" aria-label="Schedule time" value={quickDate} onValueChange={setQuickDate} />
                <Button variant="filled" size="xs" loading={quickSaving} onClick={() => void quickSchedule()}>
                  Save
                </Button>
                <IconButton icon="close" size="xs" label="Cancel" onClick={() => setQuickScheduling(false)} />
              </>
            ) : (
              <>
                <Button
                  variant="filled"
                  size="xs"
                  icon="send"
                  loading={sending}
                  disabled={!active}
                  onClick={() => (active ? setSendOpen(true) : toast.error('Campaign is inactive · Activate the campaign before sending posts.'))}
                >
                  {post.status === 'completed' ? 'Send Again' : 'Send Now'}
                </Button>
                <Button
                  variant="tonal"
                  size="xs"
                  icon={post.scheduledAt ? 'edit_calendar' : 'schedule'}
                  onClick={() => {
                    const time = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
                    if (!post.scheduledAt || Number.isNaN(time.getTime())) time.setHours(new Date().getHours() + 1);
                    setQuickDate(toDatetimeLocal(time));
                    setQuickScheduling(true);
                  }}
                >
                  {post.scheduledAt ? 'Reschedule' : 'Schedule'}
                </Button>
                {post.scheduledAt && (
                  <Button variant="text" size="xs" icon="event_busy" onClick={() => void unschedule()}>
                    Unschedule
                  </Button>
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
        {post.executions && post.executions.length > 0 && (
          <RowList>
            {post.executions.map((execution) => (
              <Row
                key={execution.id}
                lead={execution.socialAccount ? <PlatformIcon platform={execution.socialAccount.platform} size={20} /> : <Icon name="public" />}
                title={
                  <span className="flex items-center gap-2">
                    {execution.socialAccount ? displayAccountName(execution.socialAccount) : 'Channel'}
                    <StatusPill tone={postStatusTone(execution.status)}>{postStatusLabel(execution.status)}</StatusPill>
                  </span>
                }
                meta={execution.errorMsg && <span className="text-error">{execution.errorMsg}</span>}
                actions={
                  execution.externalUrl && (
                    <Button variant="text" size="xs" trailingIcon="open_in_new" href={execution.externalUrl} target="_blank" rel="noopener noreferrer">
                      Open
                    </Button>
                  )
                }
              />
            ))}
          </RowList>
        )}
      </article>

      {viewer !== null && post.media && <PostMediaViewer media={post.media} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />}
      {aiOpen && (
        <BatchAiGenerateDialog
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
        open={sendOpen}
        title={post.status === 'completed' ? 'Send This Post Again?' : 'Publish This Post Now?'}
        message={sendMessage}
        confirmLabel={post.status === 'completed' ? 'Send Again' : 'Send Now'}
        cancelLabel="Cancel"
        onClose={() => setSendOpen(false)}
        onConfirm={async () => {
          try {
            setSending(true);
            const result = await sendPostNow(post.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allOk = result?.results?.every((item: any) => item.ok) ?? true;
            if (allOk) toast.success('Post published successfully');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            else toast.error(`Failed to publish post · ${result?.results?.find((item: any) => !item.ok)?.error || result?.error || ''}`);
            await loadPost(true);
          } catch (error) {
            toast.error((error as Error)?.message || 'Failed to send post');
            await loadPost(true);
          } finally {
            setSending(false);
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmLabel="Delete Post"
        cancelLabel="Cancel"
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!backCampaignId) return;
          try {
            await deletePost(post.id);
            toast.success('Post deleted');
            navigate(`/campaigns/${backCampaignId}`);
          } catch (error) {
            toast.error((error as Error)?.message || 'Failed to delete post');
          }
        }}
      />
    </Page>
  );
}
