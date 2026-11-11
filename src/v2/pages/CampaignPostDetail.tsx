import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { deletePost, fetchPost, sendPostNow } from '../../api';
import { resourceRef, startResourceChat } from '../../lib/resource-ref';
import { Button, Icon, Text } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { formatPostTime, PostActions, usePostSchedule } from '../components/campaigns/PostCard';
import { mediaFullUrl, mediaPosterUrl, PostMediaViewer, type ViewerMedia } from '../components/campaigns/PostMediaViewer';
import { useAiTextTask } from '../components/campaigns/useAiTextTask';
import { postStatusLabel, postStatusTone } from '../lib/posts';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useCopy } from '../lib/useCopy';
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
  const action = useAction();
  const copy = useCopy();
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const postData = useAsyncData<CampaignPost>(() => fetchPost(postId!), [postId], {
    enabled: !!postId,
    // The post changed elsewhere (another tab, an MCP agent, the scheduler); batch changes name no post, so they match too.
    live: (event) => (event.resource === 'post' ? (event.id ? event.id === postId : !event.campaignId || event.campaignId === campaignId) : event.resource === 'campaign' && event.id === campaignId),
  });
  const post = postData.error ? null : (postData.data ?? null);
  const loadPost = () => postData.reload(true);
  const ai = useAiTextTask(loadPost);
  const aiTask = ai.task;
  const sending = action.isBusy('send');

  const accounts = post?.campaign?.socialAccounts || [];
  const active = post?.campaign?.status === 'active';
  const backCampaignId = campaignId || post?.campaignId || post?.campaign?.id;

  const schedule = usePostSchedule(post ?? { id: postId || '', status: 'draft' }, loadPost);

  if (postData.loading) return <LoadingState label={t('v2.campaigns.postPage.loading')} minHeight={400} />;
  if (!post) {
    return (
      <Page width="narrow">
        <EmptyState
          icon="error"
          title={t('v2.campaigns.postPage.notFound')}
          action={
            <Button variant="tonal" icon="arrow_back" href={backCampaignId ? `/campaigns/${backCampaignId}` : '/campaigns'}>
              {backCampaignId ? t('v2.campaigns.backToCampaign') : t('v2.campaigns.backToCampaigns')}
            </Button>
          }
        />
      </Page>
    );
  }

  const externalUrl = post.executions?.find((e) => e.externalUrl)?.externalUrl;
  const sendMessage = post.status === 'completed' ? t('v2.campaigns.sendAgainMessage', { count: accounts.length }) : t('v2.campaigns.sendNowMessage', { count: accounts.length });

  const reference = resourceRef.post(post.campaignId, post.id);
  const text = post.textContent?.trim();
  const executions = post.executions || [];
  const delivered = new Set(executions.map((e) => e.socialAccount?.id).filter(Boolean));
  const pending = accounts.filter((a) => !delivered.has(a.id));

  return (
    <Page density="compact">
      <PageHeader
        title={t('v2.campaigns.postPage.title')}
        description={
          post.campaign?.name ? (
            <Trans i18nKey="v2.campaigns.postForm.inCampaign" values={{ name: post.campaign.name }} components={{ b: <strong className="text-on-surface" /> }} />
          ) : undefined
        }
        backLink={backCampaignId ? { to: `/campaigns/${backCampaignId}`, label: t('v2.campaigns.backToCampaign') } : undefined}
        actions={
          <>
            <Button variant="tonal" icon="auto_awesome" onClick={() => setAiOpen(true)}>
              {t('v2.campaigns.batch.aiGenerate')}
            </Button>
            <Button variant="filled" icon="edit" href={`/campaigns/${backCampaignId}/posts/edit/${post.id}`}>
              {t('v2.campaigns.postPage.edit')}
            </Button>
            <ActionMenu
              label={t('v2.campaigns.postPage.options')}
              variant="tonal"
              items={[
                { key: 'chat', label: t('resourceRef.startChat'), icon: 'chat', onSelect: () => startResourceChat(navigate, reference) },
                {
                  key: 'ref',
                  label: t('resourceRef.copy'),
                  icon: 'tag',
                  onSelect: () => void copy(reference, `${t('resourceRef.copied')} · ${reference}`),
                },
                { key: 'delete', label: t('v2.campaigns.deletePost'), icon: 'delete', danger: true, divider: true, onSelect: () => setDeleteOpen(true) },
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
                {t('v2.campaigns.batch.noText')}
              </Text>
              <Button variant="text" size="xs" icon="auto_awesome" onClick={() => setAiOpen(true)}>
                {t('v2.campaigns.postPage.generateWithAi')}
              </Button>
            </div>
          )}
          {post.media && post.media.length > 0 && (
            <div className="v2-post-detail__media" data-count={Math.min(post.media.length, 4)}>
              {post.media.map((media, index) => {
                const url = mediaFullUrl(media);
                const poster = media.type === 'video' ? mediaPosterUrl(media) : '';
                return (
                  <button key={media.id} type="button" className="v2-post-card__thumb m3-focus-ring" aria-label={t('v2.campaigns.post.openMedia', { n: index + 1 })} onClick={() => setViewer(index)}>
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
                {aiTask && ai.running && (
                  <StatusPill tone="tertiary" icon="auto_awesome">
                    {t('v2.campaigns.postPage.generating')}
                  </StatusPill>
                )}
              </div>
              <Text variant="title-large" emphasized className="tabular-nums">
                {formatPostTime(post.scheduledAt)}
              </Text>
              {!active && (
                <Text variant="body-small" className="text-on-surface-variant">
                  {t('v2.campaigns.postPage.pausedHint')}
                </Text>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <PostActions post={post} schedule={schedule} active={active} sending={sending} size="sm" onSend={() => (active ? setSendOpen(true) : toast.error(t('v2.campaigns.inactiveCannotSend')))} />
                {externalUrl && !schedule.editing && (
                  <Button variant="text" size="sm" trailingIcon="open_in_new" href={externalUrl} target="_blank" rel="noopener noreferrer">
                    {t('v2.campaigns.post.viewLive')}
                  </Button>
                )}
              </div>
            </div>
          </Section>
          <Section variant="card" icon="share" title={t('channels')}>
            {executions.length === 0 && accounts.length === 0 ? (
              <Text variant="body-small" className="text-on-surface-variant">
                {t('v2.campaigns.postPage.noChannels')}
              </Text>
            ) : (
              <ul className="v2-delivery">
                {executions.map((execution) => (
                  <li key={execution.id}>
                    {execution.socialAccount ? <AccountAvatar account={execution.socialAccount} size={32} refreshOn={['twitter', 'x', 'threads']} /> : <Icon name="public" />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Text as="span" variant="label-large" className="truncate">
                        {execution.socialAccount ? displayAccountName(execution.socialAccount) : t('v2.campaigns.postPage.channel')}
                      </Text>
                      {execution.errorMsg && (
                        <Text as="span" variant="body-small" className="text-error [overflow-wrap:anywhere]">
                          {execution.errorMsg}
                        </Text>
                      )}
                    </span>
                    <StatusPill tone={postStatusTone(execution.status)}>{postStatusLabel(execution.status)}</StatusPill>
                    {execution.externalUrl && <Button variant="text" size="xs" trailingIcon="open_in_new" href={execution.externalUrl} target="_blank" rel="noopener noreferrer">{t('v2.campaigns.scheduled.open')}</Button>}
                  </li>
                ))}
                {pending.map((account) => (
                  <li key={account.id}>
                    <AccountAvatar account={account} size={32} refreshOn={['twitter', 'x', 'threads']} />
                    <Text as="span" variant="label-large" className="min-w-0 flex-1 truncate">
                      {displayAccountName(account)}
                    </Text>
                    <Text as="span" variant="label-medium" className="text-on-surface-variant">
                      {t('v2.campaigns.postPage.notSent')}
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
            ai.start(task);
            setAiOpen(false);
          }}
        />
      )}
      <ConfirmDialog
        open={sendOpen}
        title={post.status === 'completed' ? t('v2.campaigns.sendAgainTitle') : t('v2.campaigns.sendNowTitle')}
        message={sendMessage}
        confirmLabel={post.status === 'completed' ? t('v2.campaigns.sendAgain') : t('v2.campaigns.sendNow')}
        onClose={() => setSendOpen(false)}
        onConfirm={async () => {
          await action.run(
            async () => {
              try {
                const result = await sendPostNow(post.id);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const failure = result?.results?.find((item: any) => !item.ok);
                if (failure) throw new Error(`${t('v2.campaigns.publishFailed')} · ${failure.error || result?.error || ''}`);
              } finally {
                await loadPost();
              }
            },
            { key: 'send', success: t('v2.campaigns.postPublished'), error: t('v2.campaigns.sendFailed') },
          );
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title={t('v2.campaigns.deletePost')}
        message={t('v2.campaigns.deletePostMessage')}
        confirmLabel={t('v2.campaigns.deletePost')}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!backCampaignId) return;
          await action.run(
            async () => {
              await deletePost(post.id);
              navigate(`/campaigns/${backCampaignId}`);
            },
            { key: 'delete', success: t('v2.campaigns.postDeleted'), error: t('v2.campaigns.deletePostFailed'), rethrow: true },
          );
        }}
      />
    </Page>
  );
}
