import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { batchUnschedulePosts, deletePost, fetchCampaign, fetchCampaignPostIds, fetchCampaignPosts, sendPostNow } from '../../api';
import { Button, Checkbox, Icon, IconButton, LinearProgress, Text } from '../../m3';
import { BatchAiGenerateDialog } from '../components/campaigns/BatchAiGenerateDialog';
import { BatchScheduleDialog, BatchSetTextDialog } from '../components/campaigns/BatchPostDialogs';
import { formatPostTime } from '../components/campaigns/PostCard';
import { PostMediaViewer } from '../components/campaigns/PostMediaViewer';
import { useAiTextTask } from '../components/campaigns/useAiTextTask';
import { runEach } from '../lib/bulk';
import { errorText } from '../lib/errors';
import { postStatusLabel, postStatusTone } from '../lib/posts';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useListParams, type PageSize } from '../lib/useListParams';
import { useSelection } from '../lib/useSelection';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { ErrorState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { SortMenu } from '../ui/SortMenu';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';
import { POST_SORT_ICONS, POST_SORT_KEYS, POST_STATUS_FILTERS, POST_STATUS_ICONS, type PostSortKey, type PostStatusFilter } from './CampaignDetail';

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

const PAGE_SIZES: readonly PageSize[] = [50, 100, 250, 500, 1000];

function mediaPreviewUrl(media: NonNullable<BatchPost['media']>[number]) {
  const value = media.thumbnailUrl || media.processedUrl || media.sourceUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

/** Selects many posts of a campaign and acts on them together: AI text, set text, schedule, send and delete. */
export function CampaignBatchActions() {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const { id } = useParams<{ id: string }>();
  const list = useListParams({ pageSize: 50, pageSizes: PAGE_SIZES, defaults: { status: 'all', sort: 'scheduled_desc' } });
  const { q, page } = list;
  const pageSize = list.pageSize === 'all' ? 50 : list.pageSize;
  const statusFilter = list.oneOf('status', POST_STATUS_FILTERS);
  const sortKey = list.oneOf('sort', POST_SORT_KEYS);

  const [dialog, setDialog] = useState<'delete' | 'send' | 'unschedule' | 'ai' | 'text' | 'schedule' | null>(null);
  const [sendProgress, setSendProgress] = useState(0);
  const [lightbox, setLightbox] = useState<{ media: NonNullable<BatchPost['media']>; index: number } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignData = useAsyncData<any>(() => fetchCampaign(id!, false), [id], { enabled: !!id });
  const campaign = campaignData.data;
  const postsData = useAsyncData(() => fetchCampaignPosts(id!, { page, pageSize, q, status: statusFilter, sort: sortKey }), [id, page, pageSize, q, statusFilter, sortKey], { enabled: !!id });
  const posts: BatchPost[] = postsData.data?.items ?? [];
  const totalPosts = postsData.data?.total ?? 0;
  const counts: Record<string, number> = postsData.data?.statusCounts ?? {};
  const reloadPosts = () => postsData.reload(true);
  const ai = useAiTextTask(reloadPosts);

  // The selection spans pages, so paging keeps it; a new search, status or order starts over.
  const selection = useSelection(posts, (post) => post.id, [q, statusFilter, sortKey], { keepUnseen: true });
  const selectedIds = [...selection.selected];
  const count = selectedIds.length;
  const onPage = posts.filter((post) => selection.isSelected(post.id)).length;

  const selectAllMatching = () =>
    void action.run(
      async () => {
        const data = await fetchCampaignPostIds(id!, { q, status: statusFilter, sort: sortKey });
        selection.add(data.ids);
        return data.total;
      },
      { key: 'select-all', success: (total) => t('v2.campaigns.batch.selectedMatching', { count: total }), error: t('v2.campaigns.batch.selectMatchingFailed') },
    );

  const inactive = campaign?.status !== 'active';
  const done = async () => {
    setDialog(null);
    selection.clear();
    await reloadPosts();
  };

  const askSend = () => {
    if (inactive) {
      toast.error(t('v2.campaigns.inactiveCannotSend'));
      return;
    }
    setSendProgress(0);
    setDialog('send');
  };

  const confirmSend = async () => {
    let sent = 0;
    const result = await runEach(selectedIds, async (postId) => {
      try {
        await sendPostNow(postId);
      } finally {
        setSendProgress(++sent);
      }
    });
    if (result.failed > 0) toast.info(t('v2.campaigns.batch.sentPartial', { done: result.done, failed: result.failed }));
    else toast.success(t('v2.campaigns.batch.sent', { count: result.done }));
    await done();
  };

  const confirmUnschedule = () =>
    action.run(
      async () => {
        const result = await batchUnschedulePosts(selectedIds);
        if (result.skipped.length > 0) toast.info(t('v2.campaigns.batch.unscheduledPartial', { done: result.updated, skipped: result.skipped.length }));
        else toast.success(t('v2.campaigns.batch.unscheduled', { count: result.updated }));
        await done();
      },
      { key: 'unschedule', error: t('v2.campaigns.batch.unscheduleFailed'), rethrow: true },
    );

  const confirmDelete = async () => {
    const result = await runEach(selectedIds, deletePost);
    if (result.failed > 0) toast.error(t('v2.campaigns.batch.deletedPartial', { done: result.done, failed: result.failed, reason: result.reason }));
    else toast.success(t('v2.campaigns.batch.deleted', { count: result.done }));
    await done();
  };

  const aiTask = ai.task;
  const aiFailedResults = aiTask?.results.filter((result) => !result.ok && result.status === 'failed') || [];
  const aiFailureMessage = aiTask?.error || aiFailedResults[0]?.error;

  if (campaignData.loading) return <LoadingState label={t('v2.campaigns.loadingCampaign')} minHeight={400} />;
  if (campaignData.error || !campaign) {
    return (
      <Page width="narrow">
        <ErrorState message={campaignData.error ? errorText(campaignData.error, t('v2.campaigns.loadCampaignFailed')) : t('v2.campaigns.notFound')} onRetry={() => void campaignData.reload()} retryLabel={t('v2.common.retry')} />
      </Page>
    );
  }

  return (
    <Page density="compact">
      <PageHeader
        title={t('v2.campaigns.batchActions')}
        description={<Trans i18nKey="v2.campaigns.batch.description" values={{ name: campaign.name }} components={{ b: <strong className="text-on-surface" /> }} />}
        backLink={{ to: `/campaigns/${id}`, label: t('v2.campaigns.backToCampaign') }}
        actions={
          <Button variant="filled" icon="add" href={`/campaigns/${id}/batch/create`}>
            {t('v2.campaigns.createBatch')}
          </Button>
        }
      />

      <ListPane
        label={t('v2.campaigns.posts')}
        lead={
          <SectionNav<PostStatusFilter>
            scope={`batch-${id}`}
            label={t('v2.campaigns.filterByStatus')}
            value={statusFilter}
            onChange={(next) => list.set({ status: next })}
            items={POST_STATUS_FILTERS.filter((key) => key === 'all' || (counts[key] || 0) > 0 || statusFilter === key).map((key) => ({ value: key, label: t(`v2.campaigns.statuses.${key}`), icon: POST_STATUS_ICONS[key], count: counts[key] || 0 }))}
          />
        }
        fitKey={`${statusFilter}|${Object.values(counts).join(',')}`}
        summary={t('v2.campaigns.batch.shiftHint')}
        tools={
          <>
            <ListSearch value={q} onChange={list.setQuery} label={t('v2.campaigns.searchPosts')} />
            <SortMenu<PostSortKey> label={t('v2.campaigns.sort')} value={sortKey} onChange={(next) => list.set({ sort: next })} options={POST_SORT_KEYS.map((key) => ({ value: key, label: t(`v2.campaigns.sorts.${key}`), icon: POST_SORT_ICONS[key] }))} />
          </>
        }
        before={
          aiTask && (
            <div className="v2-autotag v2-list-pane__notice" data-tone={aiFailureMessage ? 'warning' : undefined}>
              <Icon name={ai.running ? 'progress_activity' : 'auto_awesome'} size={18} />
              <Text as="span" variant="label-medium">
                {t('v2.campaigns.ai.progress', { done: aiTask.completed, total: aiTask.total })}
              </Text>
              <LinearProgress value={aiTask.total > 0 ? aiTask.completed / aiTask.total : 0} max={1} className="v2-autotag__bar" aria-label={t('v2.campaigns.ai.label')} />
              <Button variant="text" size="xs" onClick={() => ai.start(null)}>
                {t('v2.campaigns.ai.dismiss')}
              </Button>
              {aiFailureMessage && (
                <Text variant="body-small" className="w-full truncate" title={aiFailureMessage}>
                  {t('v2.campaigns.ai.failedCount', { count: aiFailedResults.length })} · {aiFailureMessage}
                </Text>
              )}
            </div>
          )
        }
        loading={postsData.loading}
        refreshing={postsData.refreshing}
        error={postsData.error ? errorText(postsData.error, t('v2.campaigns.loadPostsFailed')) : null}
        onRetry={() => void postsData.reload()}
        count={posts.length}
        filtered={list.filtered}
        onClearFilters={list.clearFilters}
        noMatches={{ title: t('v2.campaigns.noPostsMatch'), description: t('v2.campaigns.noPostsMatchHint') }}
        empty={{
          icon: 'stacks',
          shape: 'cookie-9',
          title: t('v2.campaigns.batch.empty'),
          description: t('v2.campaigns.batch.emptyHint'),
          action: (
            <Button variant="filled" icon="add" href={`/campaigns/${id}/batch/create`}>
              {t('v2.campaigns.createBatch')}
            </Button>
          ),
        }}
        selection={{ count, selectAll: selection.selectAll, clear: selection.clear }}
        allMatching={onPage >= posts.length && count < totalPosts ? { total: totalPosts, onSelect: selectAllMatching, loading: action.isBusy('select-all') } : undefined}
        selectionActions={[
          { key: 'ai', label: t('v2.campaigns.batch.aiGenerate'), icon: 'auto_awesome', onClick: () => setDialog('ai') },
          { key: 'text', label: t('v2.campaigns.batch.setText'), icon: 'text_fields', onClick: () => setDialog('text') },
          { key: 'schedule', label: t('v2.campaigns.schedule'), icon: 'schedule', onClick: () => setDialog('schedule') },
          { key: 'unschedule', label: t('v2.campaigns.batch.unschedule'), icon: 'event_busy', onClick: () => setDialog('unschedule') },
          { key: 'send', label: t('v2.campaigns.sendNow'), icon: 'send', onClick: askSend, variant: 'filled', disabled: inactive },
          { key: 'delete', label: t('menu.delete'), icon: 'delete', onClick: () => setDialog('delete'), danger: true },
        ]}
        paging={{ page, pageSize, total: totalPosts, pages: postsData.data?.totalPages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: PAGE_SIZES }}
      >
        <RowList className="v2-list-pane__grid">
          {posts.map((post) => {
            const selected = selection.isSelected(post.id);
            const mediaUrls = (post.media || []).map(mediaPreviewUrl).filter(Boolean);
            return (
              <Row
                key={post.id}
                selected={selected}
                className="v2-batch-row"
                onClick={(e) => selection.toggle(post.id, 'shiftKey' in e ? e.shiftKey : false)}
                lead={
                  <span
                    className="v2-row__check"
                    onClick={(e) => {
                      e.stopPropagation();
                      selection.toggle(post.id, e.shiftKey);
                    }}
                  >
                    <Checkbox checked={selected} onChange={() => undefined} tabIndex={-1} aria-label={t('v2.campaigns.batch.selectPost')} />
                  </span>
                }
                title={
                  <span className="flex min-w-0 items-center gap-3">
                    {mediaUrls.length > 0 ? (
                      <button type="button" className="v2-batch-thumb m3-focus-ring" title={t('v2.campaigns.batch.viewMedia', { count: mediaUrls.length })} onClick={() => setLightbox({ media: post.media || [], index: 0 })}>
                        <img src={mediaUrls[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        {mediaUrls.length > 1 && <span className="v2-transfer-strip__more">+{mediaUrls.length - 1}</span>}
                      </button>
                    ) : (
                      <span className="v2-batch-thumb v2-batch-thumb--empty" aria-hidden>
                        <Icon name="notes" size={20} />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate">{post.textContent?.trim() || <em className="font-normal text-on-surface-variant">{t('v2.campaigns.batch.noText')}</em>}</span>
                      <span className="v2-row__meta">
                        <StatusPill tone={postStatusTone(post.status)}>{postStatusLabel(post.status)}</StatusPill>
                        <span className="tabular-nums">{formatPostTime(post.scheduledAt)}</span>
                      </span>
                    </span>
                  </span>
                }
                actions={<IconButton icon="edit" size="xs" label={t('v2.campaigns.batch.editPost')} tooltip href={`/campaigns/${id}/posts/edit/${post.id}`} />}
              />
            );
          })}
        </RowList>
      </ListPane>

      {lightbox && <PostMediaViewer media={lightbox.media} index={lightbox.index} onIndexChange={(index) => setLightbox((c) => (c ? { ...c, index } : c))} onClose={() => setLightbox(null)} />}
      <ConfirmDialog open={dialog === 'unschedule'} title={t('v2.campaigns.batch.unscheduleTitle')} message={t('v2.campaigns.batch.unscheduleMessage', { count })} confirmLabel={t('v2.campaigns.batch.unschedule')} onClose={() => setDialog(null)} onConfirm={confirmUnschedule} closeOnConfirm={false} />
      <ConfirmDialog
        open={dialog === 'send'}
        title={t('v2.campaigns.batch.sendTitle')}
        message={
          <>
            <Trans i18nKey="v2.campaigns.batch.sendMessage" count={count} values={{ name: campaign.name }} components={{ b: <strong /> }} />
            {sendProgress > 0 && (
              <span className="mt-3 block">
                {t('v2.campaigns.batch.sending', { done: sendProgress, total: count })}
                <LinearProgress value={sendProgress} max={Math.max(1, count)} className="mt-2" />
              </span>
            )}
          </>
        }
        confirmLabel={t('v2.campaigns.sendNow')}
        onClose={() => setDialog(null)}
        onConfirm={confirmSend}
        closeOnConfirm={false}
      />
      <ConfirmDialog open={dialog === 'delete'} tone="danger" title={t('v2.campaigns.batch.deleteTitle')} message={t('v2.campaigns.batch.deleteMessage', { count })} confirmLabel={t('v2.campaigns.batch.deleteConfirm')} onClose={() => setDialog(null)} onConfirm={confirmDelete} closeOnConfirm={false} />
      {dialog === 'ai' && (
        <BatchAiGenerateDialog
          postIds={selectedIds}
          onClose={() => setDialog(null)}
          onQueued={(task) => {
            ai.start(task);
            setDialog(null);
          }}
        />
      )}
      {dialog === 'text' && <BatchSetTextDialog postIds={selectedIds} onClose={() => setDialog(null)} onComplete={() => void reloadPosts()} />}
      {dialog === 'schedule' && <BatchScheduleDialog postIds={selectedIds} onClose={() => setDialog(null)} onComplete={() => void reloadPosts()} />}
    </Page>
  );
}
