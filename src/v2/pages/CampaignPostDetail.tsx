import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { deletePost, fetchBatchGeneratePostTextStatus, fetchPost, sendPostNow, type BatchGenerateTextResult } from '../../api';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { copyText, resourceRef, startResourceChat } from '../../lib/resource-ref';
import { Button, Icon, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { formatPostTime, PostActions, usePostSchedule } from '../components/campaigns/PostCard';
import { mediaFullUrl, mediaPosterUrl, PostMediaViewer, type ViewerMedia } from '../components/campaigns/PostMediaViewer';
import { postStatusLabel, postStatusTone } from '../lib/posts';
import { ActionMenu } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
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
  const { t } = useTranslation();
  const [post, setPost] = useState<CampaignPost | null>(null);
  const [loading, setLoading] = useState(true);
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

  const schedule = usePostSchedule(post ?? { id: postId || '', status: 'draft' }, () => loadPost(true));

  if (loading && !post) return <LoadingState label="Loading post..." minHeight={400} />;
  if (!post) {
    return (
      <Page width="narrow">
        <EmptyState
          icon="error"
          title="Post not found"
          action={
            <Button variant="tonal" icon="arrow_back" href={backCampaignId ? `/campaigns/${backCampaignId}` : '/campaigns'}>
              {backCampaignId ? 'Back to Campaign' : 'Back to Campaigns'}
            </Button>
          }
        />
      </Page>
    );
  }

  const externalUrl = post.executions?.find((e) => e.externalUrl)?.externalUrl;
  const sendMessage =
    post.status === 'completed'
      ? `This post was already published${accounts.length > 0 ? ` to ${accounts.length} channel${accounts.length === 1 ? '' : 's'}` : ''}. Sending it again posts a duplicate that cannot be unsent.`
      : `Publish this post${accounts.length > 0 ? ` to ${accounts.length} connected channel${accounts.length === 1 ? '' : 's'}` : ''} right now? It goes live immediately and cannot be unsent.`;

  const reference = resourceRef.post(post.campaignId, post.id);
  const text = post.textContent?.trim();
  const executions = post.executions || [];
  const delivered = new Set(executions.map((e) => e.socialAccount?.id).filter(Boolean));
  const pending = accounts.filter((a) => !delivered.has(a.id));

  return (
    <Page density="compact">
      <PageHeader
        title="Post"
        description={
          post.campaign?.name ? (
            <>
              In <strong className="text-on-surface">{post.campaign.name}</strong>
            </>
          ) : undefined
        }
        backLink={backCampaignId ? { to: `/campaigns/${backCampaignId}`, label: 'Back to Campaign' } : undefined}
        actions={
          <>
            <Button variant="tonal" icon="auto_awesome" onClick={() => setAiOpen(true)}>
              AI Generate
            </Button>
            <Button variant="filled" icon="edit" href={`/campaigns/${backCampaignId}/posts/edit/${post.id}`}>
              Edit
            </Button>
            <ActionMenu
              label="Post options"
              variant="tonal"
              items={[
                { key: 'chat', label: t('resourceRef.startChat'), icon: 'chat', onSelect: () => startResourceChat(navigate, reference) },
                {
                  key: 'ref',
                  label: t('resourceRef.copy'),
                  icon: 'tag',
                  onSelect: () => {
                    copyText(reference).then(
                      () => toast.success(`${t('resourceRef.copied')} · ${reference}`),
                      () => toast.error(`${t('resourceRef.copyFailed')} · ${reference}`),
                    );
                  },
                },
                { key: 'delete', label: 'Delete Post', icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteOpen(true) },
              ]}
            />
          </>
        }
      />
      <div className="v2-split v2-split--end">
        <article className="v2-post-detail">
          {text ? (
            <Text variant="body-large" className="v2-post-detail__text">
              {post.textContent}
            </Text>
          ) : (
            <div className="v2-post-detail__notext">
              <Text variant="body-medium" className="italic text-on-surface-variant">
                No text yet.
              </Text>
              <Button variant="text" size="xs" icon="auto_awesome" onClick={() => setAiOpen(true)}>
                Generate with AI
              </Button>
            </div>
          )}
          {post.media && post.media.length > 0 && (
            <div className="v2-post-detail__media" data-count={Math.min(post.media.length, 4)}>
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
        </article>
        <div className="v2-split__rail flex flex-col gap-4">
          <Section variant="card">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={postStatusTone(post.status)} icon={post.status === 'processing' ? 'progress_activity' : undefined}>
                  {postStatusLabel(post.status)}
                </StatusPill>
                {aiTask && (aiTask.status === 'queued' || aiTask.status === 'running') && (
                  <StatusPill tone="tertiary" icon="auto_awesome">
                    Generating text
                  </StatusPill>
                )}
              </div>
              <Text variant="title-large" emphasized className="tabular-nums">
                {formatPostTime(post.scheduledAt)}
              </Text>
              {!active && (
                <Text variant="body-small" className="text-on-surface-variant">
                  The campaign is paused, so this post will not be sent.
                </Text>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PostActions post={post} schedule={schedule} active={active} sending={sending} size="sm" onSend={() => (active ? setSendOpen(true) : toast.error('Campaign is inactive · Activate the campaign before sending posts.'))} />
                {externalUrl && !schedule.editing && (
                  <Button variant="text" size="sm" trailingIcon="open_in_new" href={externalUrl} target="_blank" rel="noopener noreferrer">
                    View live
                  </Button>
                )}
              </div>
            </div>
          </Section>
          <Section variant="card" icon="share" title="Channels">
            {executions.length === 0 && accounts.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                This campaign has no channels.
              </Text>
            ) : (
              <ul className="v2-delivery">
                {executions.map((execution) => (
                  <li key={execution.id}>
                    {execution.socialAccount ? <AccountAvatar account={execution.socialAccount} size={32} refreshOn={['twitter', 'x', 'threads']} /> : <Icon name="public" />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Text as="span" variant="label-large" className="truncate">
                        {execution.socialAccount ? displayAccountName(execution.socialAccount) : 'Channel'}
                      </Text>
                      {execution.errorMsg && (
                        <Text as="span" variant="body-small" className="text-error [overflow-wrap:anywhere]">
                          {execution.errorMsg}
                        </Text>
                      )}
                    </span>
                    <StatusPill tone={postStatusTone(execution.status)}>{postStatusLabel(execution.status)}</StatusPill>
                    {execution.externalUrl && <Button variant="text" size="xs" trailingIcon="open_in_new" href={execution.externalUrl} target="_blank" rel="noopener noreferrer">Open</Button>}
                  </li>
                ))}
                {pending.map((account) => (
                  <li key={account.id}>
                    <AccountAvatar account={account} size={32} refreshOn={['twitter', 'x', 'threads']} />
                    <Text as="span" variant="label-large" className="min-w-0 flex-1 truncate">
                      {displayAccountName(account)}
                    </Text>
                    <Text as="span" variant="label-medium" className="text-on-surface-variant">
                      Not sent
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

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
