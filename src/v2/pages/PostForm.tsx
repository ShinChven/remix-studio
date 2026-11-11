import { Trans, useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addPostMedia, createPost, fetchCampaign, fetchPost, removePostMedia, reorderPostMedia, saveImage, saveVideo, updatePost } from '../../api';
import { Button, cx, Icon, IconButton, LoadingIndicator, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { toDatetimeLocal } from '../lib/posts';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { useToast } from '../ui/useToast';
import { readFileAsDataUrl } from '../lib/files';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string | null;
}

interface PostMedia {
  id: string;
  sourceUrl: string;
  processedUrl?: string | null;
  thumbnailUrl?: string | null;
  type: 'image' | 'video' | 'gif' | string;
  status?: string;
}

const POST_MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime';

function mediaPreviewUrl(media: Pick<PostMedia, 'thumbnailUrl' | 'processedUrl' | 'sourceUrl'>) {
  const value = media.thumbnailUrl || media.processedUrl || media.sourceUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

function prettyMediaName(url: string | null | undefined) {
  if (!url) return '';
  const path = url.split('?')[0];
  return path.split('/').pop() || path;
}

function accountName(account: SocialAccount) {
  return account.profileName || account.accountId || account.platform;
}

function getFileMediaType(file: File): 'image' | 'video' | 'gif' {
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}



/** Creates or edits a campaign post: text, up to four images or videos in order, and when it goes out. */
export function PostForm() {
  const { t } = useTranslation();
  const toast = useToast();
  const { campaignId, postId } = useParams<{ campaignId: string; postId: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(postId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaign, setCampaign] = useState<any>(null);
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [existingMedia, setExistingMedia] = useState<PostMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReorderingMedia, setIsReorderingMedia] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mediaToRemove, setMediaToRemove] = useState<string | null>(null);
  const [draggedReorderIndex, setDraggedReorderIndex] = useState<number | null>(null);
  const [dragOverReorderIndex, setDragOverReorderIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!campaignId) return;
    setIsLoading(true);
    try {
      const campaignData = await fetchCampaign(campaignId);
      setCampaign(campaignData);

      if (isEditing && postId) {
        const post = await fetchPost(postId);
        setContent(post.textContent || '');
        setScheduledAt(post.scheduledAt ? toDatetimeLocal(new Date(post.scheduledAt)) : '');
        setExistingMedia(post.media || []);
      }
    } catch (error) {
      toast.error(errorText(error, t('v2.campaigns.postForm.loadFailed')));
      navigate(`/campaigns/${campaignId}`);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId, isEditing, navigate, postId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const targetAccounts: SocialAccount[] = campaign?.socialAccounts || [];
  const visibleExistingMedia = useMemo(
    () => existingMedia.filter((media) => !removedMediaIds.has(media.id)),
    [existingMedia, removedMediaIds],
  );
  const totalMediaCount = visibleExistingMedia.length + newFiles.length;
  const overX = content.length > 280 && targetAccounts.some((a) => ['x', 'twitter'].includes(a.platform?.toLowerCase()));

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const supported = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (supported.length !== files.length) {
      toast.error(t('v2.campaigns.postForm.unsupported'));
      return;
    }
    if (totalMediaCount + supported.length > 4) {
      toast.error(t('v2.campaigns.postForm.tooMany'));
      return;
    }
    setNewFiles((prev) => [...prev, ...supported]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const isFileDragEvent = (event: React.DragEvent) => {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (!isFileDragEvent(event)) return;
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const handleMediaDragStart = (event: React.DragEvent, index: number) => {
    setDraggedReorderIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-post-media-index', String(index));
  };

  const handleMediaDragOver = (event: React.DragEvent, index: number) => {
    if (draggedReorderIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragOverReorderIndex !== index) setDragOverReorderIndex(index);
  };

  const handleMediaDragEnd = () => {
    setDraggedReorderIndex(null);
    setDragOverReorderIndex(null);
  };

  const moveMedia = async (fromIndex: number, dropIndex: number) => {
    if (isReorderingMedia) return;
    if (fromIndex === dropIndex) return;
    if (fromIndex < 0 || dropIndex < 0) return;

    const visibleMediaCount = visibleExistingMedia.length;
    type Slot =
      | { kind: 'existing'; media: PostMedia }
      | { kind: 'new'; file: File };
    const combined: Slot[] = [
      ...visibleExistingMedia.map((media) => ({ kind: 'existing' as const, media })),
      ...newFiles.map((file) => ({ kind: 'new' as const, file })),
    ];
    if (fromIndex >= combined.length || dropIndex >= combined.length) return;
    const [moved] = combined.splice(fromIndex, 1);
    combined.splice(dropIndex, 0, moved);

    const nextVisibleExisting = combined
      .filter((slot): slot is Extract<Slot, { kind: 'existing' }> => slot.kind === 'existing')
      .map((slot) => slot.media);
    const nextNewFiles = combined
      .filter((slot): slot is Extract<Slot, { kind: 'new' }> => slot.kind === 'new')
      .map((slot) => slot.file);

    const movedExistingOnly = fromIndex < visibleMediaCount || dropIndex < visibleMediaCount;
    if (movedExistingOnly && postId && nextVisibleExisting.length > 0) {
      setIsReorderingMedia(true);
      try {
        const res = await reorderPostMedia(postId, nextVisibleExisting.map((m) => m.id));
        const removed = existingMedia.filter((media) => removedMediaIds.has(media.id));
        setExistingMedia([...(res.media as PostMedia[]), ...removed]);
        setNewFiles(nextNewFiles);
      } catch (err) {
        toast.error(errorText(err, t('v2.campaigns.postForm.reorderFailed')));
        await loadData();
      } finally {
        setIsReorderingMedia(false);
      }
      return;
    }

    const removed = existingMedia.filter((media) => removedMediaIds.has(media.id));
    setExistingMedia([...nextVisibleExisting, ...removed]);
    setNewFiles(nextNewFiles);
  };

  const handleMediaDrop = async (event: React.DragEvent, dropIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const fromIndex = draggedReorderIndex;
    setDraggedReorderIndex(null);
    setDragOverReorderIndex(null);
    if (fromIndex === null) return;
    await moveMedia(fromIndex, dropIndex);
  };

  const handleSave = async () => {
    if (!campaignId) return;
    if (!content.trim() && totalMediaCount === 0) {
      toast.error(t('v2.campaigns.postForm.needContent'));
      return;
    }
    if (scheduledAt && new Date(scheduledAt) < new Date(Date.now() + 5 * 60_000)) {
      toast.error(t('v2.campaigns.postForm.tooSoon'));
      return;
    }

    setIsSaving(true);
    try {
      const status = scheduledAt ? 'scheduled' : 'draft';
      const schedule = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const post = isEditing && postId
        ? await updatePost(postId, { textContent: content, status, scheduledAt: schedule })
        : await createPost({ campaignId, textContent: content, status, scheduledAt: schedule });

      for (const mediaId of removedMediaIds) {
        await removePostMedia(mediaId);
      }
      for (const file of newFiles) {
        const base64 = await readFileAsDataUrl(file);
        const mediaType = getFileMediaType(file);
        const uploaded = mediaType === 'video'
          ? await saveVideo(base64, campaignId)
          : await saveImage(base64, campaignId);
        await addPostMedia(post.id, { sourceUrl: uploaded.key, type: mediaType });
      }

      toast.success(isEditing ? t('v2.campaigns.postForm.updated') : t('v2.campaigns.postForm.created'));
      navigate(`/campaigns/${campaignId}`);
    } catch (error) {
      toast.error(errorText(error, t('v2.campaigns.postForm.saveFailed')));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <LoadingState minHeight={400} />;

  const tileProps = (index: number) => ({
    draggable: !isReorderingMedia,
    onDragStart: (e: React.DragEvent) => handleMediaDragStart(e, index),
    onDragOver: (e: React.DragEvent) => handleMediaDragOver(e, index),
    onDrop: (e: React.DragEvent) => void handleMediaDrop(e, index),
    onDragEnd: handleMediaDragEnd,
    'data-dragging': draggedReorderIndex === index ? '' : undefined,
    'data-drop-target': dragOverReorderIndex === index && draggedReorderIndex !== null && draggedReorderIndex !== index ? '' : undefined,
  });
  const tileOverlay = (index: number, label: string | null, onRemove: () => void, isNew = false) => (
    <>
      <span className="v2-post-tile__top">
        <span className="v2-post-tile__pos">{index + 1}</span>
        <IconButton icon="delete" size="xs" variant="filled" className="v2-button-danger" label={t('v2.campaigns.postForm.removeMedia')} onClick={onRemove} />
      </span>
      <span className="v2-post-tile__bottom">
        {label ? <span className="v2-info-chip" data-tone={isNew ? 'primary' : undefined}>{label}</span> : <span />}
        {totalMediaCount > 1 && (
          <span className="flex">
            <IconButton icon="chevron_left" size="xs" variant="tonal" label={t('v2.campaigns.postForm.moveEarlier')} disabled={isReorderingMedia || index === 0} onClick={() => void moveMedia(index, index - 1)} />
            <IconButton icon="chevron_right" size="xs" variant="tonal" label={t('v2.campaigns.postForm.moveLater')} disabled={isReorderingMedia || index >= totalMediaCount - 1} onClick={() => void moveMedia(index, index + 1)} />
          </span>
        )}
      </span>
    </>
  );

  return (
    <Page density="compact">
      <PageHeader title={isEditing ? t('v2.campaigns.batch.editPost') : t('v2.campaigns.postForm.newPost')} description={campaign?.name ? <Trans i18nKey="v2.campaigns.postForm.inCampaign" values={{ name: campaign.name }} components={{ b: <strong className="text-on-surface" /> }} /> : undefined} backLink={{ label: t('v2.campaigns.postForm.back'), onClick: () => navigate(-1) }} />
      <div className="v2-split v2-split--end">
        <Section variant="card" title={t('v2.campaigns.postForm.content')}>
          <div className="flex flex-col gap-4">
            <TextField
              variant="outlined"
              label={t('v2.campaigns.postForm.postContent')}
              placeholder={t('v2.campaigns.postForm.contentPlaceholder')}
              multiline
              rows={8}
              maxRows={20}
              value={content}
              onValueChange={setContent}
              supportingText={t('v2.campaigns.dialogs.characters', { count: content.length })}
              error={overX}
              errorText={t('v2.campaigns.postForm.overX', { count: content.length })}
              fullWidth
            />
            <div
              className="v2-post-media"
              data-dragging={isDragging ? '' : undefined}
              onDragOver={(e) => {
                if (!isFileDragEvent(e)) return;
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="flex items-center justify-between gap-2">
                <Text variant="label-large" emphasized>
                  {t('v2.campaigns.media')}
                </Text>
                <span className="flex items-center gap-2">
                  {isReorderingMedia && (
                    <Text as="span" variant="label-small" className="flex items-center gap-1 text-on-surface-variant">
                      <LoadingIndicator size={18} aria-hidden /> {t('v2.campaigns.postForm.savingOrder')}
                    </Text>
                  )}
                  <span className="v2-info-chip">{totalMediaCount}/4</span>
                  <Button variant="tonal" size="xs" icon="add_photo_alternate" onClick={() => fileInputRef.current?.click()}>
                    {t('v2.campaigns.postForm.addFiles')}
                  </Button>
                  <input ref={fileInputRef} type="file" multiple accept={POST_MEDIA_ACCEPT} hidden onChange={handleFileChange} />
                </span>
              </div>
              {totalMediaCount > 0 ? (
                <>
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t('v2.campaigns.postForm.reorderHint')}
                  </Text>
                  <div className="v2-post-tiles">
                    {visibleExistingMedia.map((media, index) => {
                      const preview = mediaPreviewUrl(media);
                      return (
                        <div key={media.id} className="v2-post-tile" title={prettyMediaName(media.sourceUrl)} {...tileProps(index)}>
                          {preview && media.type !== 'video' ? <img src={preview} alt="" referrerPolicy="no-referrer" /> : <span className="v2-post-tile__kind">{media.type || 'media'}</span>}
                          {tileOverlay(index, media.type === 'image' ? null : media.type || 'media', () => setMediaToRemove(media.id))}
                        </div>
                      );
                    })}
                    {newFiles.map((file, i) => {
                      const index = visibleExistingMedia.length + i;
                      return (
                        <div key={`${file.name}-${i}`} className="v2-post-tile" data-new="" title={file.name} {...tileProps(index)}>
                          <NewFilePreview file={file} />
                          {tileOverlay(index, t('v2.campaigns.postForm.new'), () => setNewFiles((prev) => prev.filter((_, j) => j !== i)), true)}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <button type="button" className="v2-post-media__empty m3-focus-ring" onClick={() => fileInputRef.current?.click()}>
                  <Icon name={isDragging ? 'upload' : 'add_photo_alternate'} size={36} />
                  <Text variant="body-medium">{isDragging ? t('v2.campaigns.postForm.dropToUpload') : t('v2.campaigns.postForm.noMedia')}</Text>
                  <Text variant="body-small" className="text-on-surface-variant">
                    {t('v2.campaigns.postForm.mediaHint')}
                  </Text>
                </button>
              )}
            </div>
          </div>
        </Section>
        <div className="v2-split__rail flex flex-col gap-4">
          <Section variant="card" icon="event" title={t('v2.campaigns.schedule')} description={scheduledAt ? t('v2.campaigns.postForm.publishesAt') : t('v2.campaigns.postForm.savedAsDraft')}>
            <div className="flex items-start gap-2">
              <TextField variant="outlined" type="datetime-local" aria-label={t('v2.campaigns.post.scheduleTime')} value={scheduledAt} onValueChange={setScheduledAt} className="min-w-0 flex-1" fullWidth />
              {scheduledAt && <IconButton icon="close" label={t('v2.campaigns.postForm.clearSchedule')} tooltip onClick={() => setScheduledAt('')} />}
            </div>
          </Section>
          <Section variant="card" icon="share" title={t('channels')} description={targetAccounts.length > 0 ? t('v2.campaigns.postForm.everyChannel') : undefined}>
            {targetAccounts.length > 0 ? (
              <span className="flex flex-wrap gap-2">
                {targetAccounts.map((account) => (
                  <span key={account.id} className="v2-channel-chip" title={`${accountName(account)} · ${account.platform}`}>
                    <AccountAvatar account={account} size={24} refreshOn={['twitter', 'x', 'threads']} />
                    <span className="truncate">{accountName(account)}</span>
                  </span>
                ))}
              </span>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Text variant="body-small" className="text-on-surface-variant">
                  {t('v2.campaigns.postForm.noChannels')}
                </Text>
                <Button variant="tonal" size="xs" icon="add_link" href={`/campaigns/edit/${campaignId}`}>
                  {t('v2.campaigns.connectChannel')}
                </Button>
              </div>
            )}
          </Section>
          <div className="flex flex-col gap-2">
            <Button variant="filled" size="md" icon={scheduledAt ? 'schedule_send' : 'save'} loading={isSaving} fullWidth emphasized onClick={() => void handleSave()}>
              {scheduledAt ? (isEditing ? t('v2.campaigns.postForm.saveAndSchedule') : t('v2.campaigns.postForm.schedulePost')) : isEditing ? t('v2.campaigns.postForm.saveDraft') : t('v2.campaigns.postForm.createDraft')}
            </Button>
            <Button variant="text" fullWidth disabled={isSaving} onClick={() => navigate(`/campaigns/${campaignId}`)}>
              {t('confirmModal.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={mediaToRemove !== null}
        tone="danger"
        title={t('v2.campaigns.postForm.removeTitle')}
        message={t('v2.campaigns.postForm.removeMessage')}
        confirmLabel={t('v2.campaigns.postForm.remove')}
        onClose={() => setMediaToRemove(null)}
        onConfirm={() => {
          if (mediaToRemove) setRemovedMediaIds((prev) => new Set(prev).add(mediaToRemove));
        }}
      />
    </Page>
  );
}

function NewFilePreview({ file }: { file: File }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!preview) return null;
  return file.type.startsWith('video/') ? <video src={preview} muted playsInline /> : <img src={preview} alt="" />;
}
