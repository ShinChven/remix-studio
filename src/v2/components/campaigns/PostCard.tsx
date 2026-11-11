import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { batchUnschedulePosts, updatePost } from '../../../api';
import { resourceRef, startResourceChat } from '../../../lib/resource-ref';
import { Button, Icon, IconButton, MenuItem, SplitButton, Text, TextField } from '../../../m3';
import i18n from '../../i18n';
import { postStatusLabel, postStatusTone, toDatetimeLocal } from '../../lib/posts';
import { useAction } from '../../lib/useAction';
import { useCopy } from '../../lib/useCopy';
import { ActionMenu } from '../../ui/ActionMenu';
import { StatusPill } from '../../ui/Stat';
import { useToast } from '../../ui/useToast';
import { mediaFullUrl, mediaPosterUrl, type ViewerMedia } from './PostMediaViewer';

export interface PostCardMedia extends ViewerMedia {
  id: string;
}

export interface PostCardPost {
  id: string;
  textContent?: string | null;
  status: string;
  scheduledAt?: string | null;
  media?: PostCardMedia[];
  executions?: Array<{ externalUrl?: string | null }>;
}

/** When a post goes out, as people read it. */
export function formatPostTime(value?: string | null) {
  if (!value) return i18n.t('v2.campaigns.notScheduled');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return i18n.t('v2.campaigns.notScheduled');
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Scheduling state of one post: the inline time editor and the unschedule call, shared by the card and the post page. */
export function usePostSchedule(post: PostCardPost, onChanged: () => void | Promise<void>) {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const saving = action.isBusy('save');

  const open = () => {
    const time = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
    if (!post.scheduledAt || Number.isNaN(time.getTime())) {
      time.setTime(Date.now());
      time.setHours(time.getHours() + 1);
    }
    setValue(toDatetimeLocal(time));
    setEditing(true);
  };

  const save = async () => {
    if (!value) {
      toast.error(t('v2.campaigns.post.pickTime'));
      return;
    }
    await action.run(
      async () => {
        await updatePost(post.id, { textContent: post.textContent || '', status: 'scheduled', scheduledAt: new Date(value).toISOString() });
        setEditing(false);
        await onChanged();
      },
      { key: 'save', success: t('v2.campaigns.post.scheduled'), error: t('v2.campaigns.post.scheduleFailed') },
    );
  };

  const unschedule = () =>
    action.run(
      async () => {
        await batchUnschedulePosts([post.id]);
        await onChanged();
      },
      { key: 'unschedule', success: t('v2.campaigns.post.unscheduled'), error: t('v2.campaigns.batch.unscheduleFailed') },
    );

  return { editing, value, saving, setValue, open, close: () => setEditing(false), save, unschedule };
}

export interface PostActionsProps {
  post: PostCardPost;
  schedule: ReturnType<typeof usePostSchedule>;
  /** An inactive campaign cannot send. */
  active: boolean;
  sending?: boolean;
  onSend: () => void;
  size?: 'xs' | 'sm';
}

/** The send split button with its schedule choices, or the inline time editor while scheduling. */
export function PostActions({ post, schedule, active, sending, onSend, size = 'xs' }: PostActionsProps) {
  const { t } = useTranslation();
  if (schedule.editing) {
    return (
      <div className="v2-post-schedule">
        <TextField variant="outlined" type="datetime-local" aria-label={t('v2.campaigns.post.scheduleTime')} value={schedule.value} onValueChange={schedule.setValue} className="v2-post-schedule__field" />
        <Button variant="filled" size={size} loading={schedule.saving} onClick={() => void schedule.save()}>
          {t('v2.campaigns.post.save')}
        </Button>
        <Button variant="text" size={size} disabled={schedule.saving} onClick={schedule.close}>
          {t('confirmModal.cancel', 'Cancel')}
        </Button>
      </div>
    );
  }
  return (
    <SplitButton variant={post.status === 'completed' ? 'tonal' : 'filled'} size={size} icon={sending ? 'progress_activity' : 'send'} label={post.status === 'completed' ? t('v2.campaigns.sendAgain') : t('v2.campaigns.sendNow')} menuLabel={t('v2.campaigns.post.scheduleOptions')} placement="bottom-start" disabled={sending} onClick={onSend} title={active ? undefined : t('v2.campaigns.post.resumeToSend')}>
      <MenuItem icon={post.scheduledAt ? 'edit_calendar' : 'schedule'} onSelect={schedule.open}>
        {post.scheduledAt ? t('v2.campaigns.post.rescheduleMenu') : t('v2.campaigns.post.scheduleMenu')}
      </MenuItem>
      {post.scheduledAt && (
        <MenuItem icon="event_busy" onSelect={() => void schedule.unschedule()}>
          {t('v2.campaigns.batch.unschedule')}
        </MenuItem>
      )}
    </SplitButton>
  );
}

/** Up to four media of a post as one square mosaic; each tile opens the viewer. */
export function PostMediaMosaic({ media, onOpen, className }: { media: PostCardMedia[]; onOpen: (index: number) => void; className?: string }) {
  const { t } = useTranslation();
  const shown = media.slice(0, 4);
  return (
    <div className={className ? `v2-post-mosaic ${className}` : 'v2-post-mosaic'} data-count={shown.length}>
      {shown.map((item, index) => {
        const url = mediaFullUrl(item);
        const poster = item.type === 'video' ? mediaPosterUrl(item) : '';
        return (
          <button key={item.id} type="button" className="v2-post-card__thumb m3-focus-ring" aria-label={t('v2.campaigns.post.openMedia', { n: index + 1 })} onClick={() => onOpen(index)}>
            {url && item.type !== 'video' ? (
              <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" />
            ) : poster ? (
              <img src={poster} alt="" referrerPolicy="no-referrer" loading="lazy" />
            ) : url ? (
              <video src={url} muted playsInline preload="metadata" />
            ) : (
              <Icon name="image" />
            )}
            {item.type === 'video' && (
              <span className="v2-tile__overlay">
                <Icon name="play_arrow" filled />
              </span>
            )}
            {media.length > 4 && index === 3 && <span className="v2-transfer-strip__more">+{media.length - 4}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface PostCardProps {
  post: PostCardPost;
  campaignId: string;
  active: boolean;
  sending?: boolean;
  onSend: () => void;
  onDelete: () => void;
  onAiGenerate: () => void;
  onOpenMedia: (index: number) => void;
  /** Reload after the schedule changed. */
  onChanged: () => void | Promise<void>;
}

/** One post in a campaign: status and time, its text beside its media, and the send and schedule actions. */
export function PostCard({ post, campaignId, active, sending, onSend, onDelete, onAiGenerate, onOpenMedia, onChanged }: PostCardProps) {
  const { t } = useTranslation();
  const copy = useCopy();
  const navigate = useNavigate();
  const schedule = usePostSchedule(post, onChanged);
  const reference = resourceRef.post(campaignId, post.id);
  const viewHref = `/campaigns/${campaignId}/posts/${post.id}`;
  const externalUrl = post.executions?.find((e) => e.externalUrl)?.externalUrl;
  const text = post.textContent?.trim();
  const hasMedia = Boolean(post.media && post.media.length > 0);

  return (
    <article className="v2-post-card" data-status={post.status}>
      <header className="v2-post-card__head">
        <StatusPill tone={postStatusTone(post.status)} icon={post.status === 'processing' ? 'progress_activity' : undefined}>
          {postStatusLabel(post.status)}
        </StatusPill>
        <button type="button" className="v2-post-card__when m3-focus-ring" title={post.scheduledAt ? t('v2.campaigns.post.reschedule') : t('v2.campaigns.schedule')} onClick={schedule.open}>
          <Icon name={post.scheduledAt ? 'event' : 'schedule'} size={16} />
          <span className="truncate tabular-nums">{formatPostTime(post.scheduledAt)}</span>
        </button>
        <span className="v2-post-card__tools">
          <IconButton icon="edit" size="xs" label={t('v2.campaigns.batch.editPost')} tooltip href={`/campaigns/${campaignId}/posts/edit/${post.id}`} />
          <ActionMenu
            label={t('v2.common.more')}
            size="xs"
            items={[
              { key: 'view', label: t('v2.campaigns.post.view'), icon: 'open_in_new', href: viewHref },
              { key: 'ai', label: t('v2.campaigns.batch.aiGenerate'), icon: 'auto_awesome', onSelect: onAiGenerate },
              { key: 'chat', label: t('resourceRef.startChat'), icon: 'chat', divider: true, onSelect: () => startResourceChat(navigate, reference) },
              {
                key: 'ref',
                label: t('resourceRef.copy'),
                icon: 'tag',
                onSelect: () => void copy(reference, `${t('resourceRef.copied')} · ${reference}`),
              },
              { key: 'delete', label: t('v2.campaigns.deletePost'), icon: 'delete', danger: true, divider: true, onSelect: onDelete },
            ]}
          />
        </span>
      </header>
      <div className="v2-post-card__body" data-media={hasMedia ? '' : undefined}>
        {hasMedia && <PostMediaMosaic media={post.media!} onOpen={onOpenMedia} />}
        <Link to={viewHref} className="v2-post-card__text" data-empty={text ? undefined : ''}>
          {text || t('v2.campaigns.batch.noText')}
        </Link>
      </div>
      <footer className="v2-post-card__foot">
        <PostActions post={post} schedule={schedule} active={active} sending={sending} onSend={onSend} />
        {externalUrl && !schedule.editing && (
          <Button variant="text" size="xs" trailingIcon="open_in_new" href={externalUrl} target="_blank" rel="noopener noreferrer">
            {t('v2.campaigns.post.viewLive')}
          </Button>
        )}
      </footer>
    </article>
  );
}
