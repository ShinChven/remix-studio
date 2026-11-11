import { Trans, useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { FloatBar } from '../ui/SelectionBar';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  batchCreateCampaignMediaPosts,
  fetchBatchCreateCampaignMediaStatus,
  fetchCampaign,
  fetchPostWatermarkSettings,
  imageDisplayUrl,
  updatePostWatermarkSettings,
  type BatchCreateMediaItemInput,
  type CampaignMediaImportSource,
  type PostWatermarkSettings,
} from '../../api';
import { Button, Icon, IconButton, LinearProgress, Text, TextField } from '../../m3';
import { MediaPicker, type UniversalPickedItem } from '../components/MediaPicker';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { DropZone } from '../ui/DropZone';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { useToast } from '../ui/useToast';
import { readFileAsDataUrl } from '../lib/files';

const POST_MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime';

type PickerMode = 'library' | 'album';
type MediaType = 'image' | 'video';

type BatchQueueItem =
  | {
      id: string;
      kind: 'local';
      file: File;
      preview: string;
      mediaType: MediaType;
      content: string;
    }
  | {
      id: string;
      kind: 'library';
      libraryId: string;
      itemId: string;
      preview?: string;
      title?: string;
      rawUrl?: string;
      mediaType: MediaType;
      content: string;
    }
  | {
      id: string;
      kind: 'album';
      projectId: string;
      itemId: string;
      preview?: string;
      title?: string;
      rawUrl?: string;
      mediaType: MediaType;
      content: string;
    };

function importKey(mode: PickerMode, sourceId: string, itemId: string) {
  return JSON.stringify([mode, sourceId, itemId]);
}


function getFileMediaType(file: File): MediaType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}



/** Queues media from uploads, libraries or albums, one post each with its own caption, with an optional watermark. */
export function CampaignBatchCreate() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaign, setCampaign] = useState<any>(null);
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<PostWatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const [isWatermarkSaving, setIsWatermarkSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (!id) return;
      setIsLoading(true);
      try {
        const watermarkPromise = fetchPostWatermarkSettings().catch((error) => {
          console.warn('Failed to load watermark settings', error);
          toast.error(t('v2.campaigns.create.watermarkLoadFailed'));
          return DEFAULT_WATERMARK_SETTINGS;
        });
        const [campaignData, watermarkData] = await Promise.all([
          fetchCampaign(id),
          watermarkPromise,
        ]);
        if (cancelled) return;
        setCampaign(campaignData);
        setWatermarkSettings({ ...DEFAULT_WATERMARK_SETTINGS, ...watermarkData });
        setWatermarkLoaded(true);
      } catch (error) {
        if (!cancelled) {
          toast.error(errorText(error, t('v2.campaigns.loadCampaignFailed')));
          navigate('/campaigns');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
      setQueue((items) => {
        for (const item of items) {
          if (item.kind === 'local') URL.revokeObjectURL(item.preview);
        }
        return items;
      });
    };
  }, [id, navigate]);

  const watermarkPreviewUrl = useMemo(() => {
    const imageItem = queue.find((item) => item.mediaType === 'image');
    if (!imageItem) return undefined;
    return imageItem.kind === 'local' ? imageItem.preview : imageItem.preview;
  }, [queue]);

  const openPicker = (mode: PickerMode) => {
    setPickerMode(mode);
  };

  const closePicker = () => {
    setPickerMode(null);
  };

  const addPickedItemsToQueue = (pickedItems: UniversalPickedItem[]) => {
    const existingKeys = new Set(queue.map((item) => {
      if (item.kind === 'library') return importKey('library', item.libraryId, item.itemId);
      if (item.kind === 'album') return importKey('album', item.projectId, item.itemId);
      return item.id;
    }));

    const additions = pickedItems.flatMap<BatchQueueItem>((item) => {
      if (item.type !== 'image' && item.type !== 'video') return [];
      const key = importKey(item.sourceKind, item.sourceId, item.itemId);
      if (existingKeys.has(key)) return [];

      return item.sourceKind === 'library'
        ? [{
            id: crypto.randomUUID(),
            kind: 'library',
            libraryId: item.sourceId,
            itemId: item.itemId,
            preview: item.previewUrl,
            title: item.title || item.sourceName,
            rawUrl: item.rawUrl,
            mediaType: item.type,
            content: '',
          }]
        : [{
            id: crypto.randomUUID(),
            kind: 'album',
            projectId: item.sourceId,
            itemId: item.itemId,
            preview: item.previewUrl,
            title: item.title || item.sourceName,
            rawUrl: item.rawUrl,
            mediaType: item.type,
            content: '',
          }];
    });

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
      toast.success(t('v2.campaigns.create.added', { count: additions.length }));
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    const unsupported = nextFiles.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
    if (unsupported) {
      toast.error(t('v2.campaigns.create.unsupported'));
      return;
    }
    const drafts: BatchQueueItem[] = nextFiles.map((file) => ({
      id: crypto.randomUUID(),
      kind: 'local',
      file,
      preview: URL.createObjectURL(file),
      mediaType: getFileMediaType(file),
      content: '',
    }));
    setQueue((prev) => [...prev, ...drafts]);
  };


  const removeQueueItem = (itemId: string) => {
    setQueue((prev) => {
      const item = prev.find((queueItem) => queueItem.id === itemId);
      if (item?.kind === 'local') URL.revokeObjectURL(item.preview);
      return prev.filter((queueItem) => queueItem.id !== itemId);
    });
  };

  const clearQueue = () => {
    for (const item of queue) {
      if (item.kind === 'local') URL.revokeObjectURL(item.preview);
    }
    setQueue([]);
  };

  const updateContent = (itemId: string, content: string) => {
    setQueue((prev) => prev.map((item) => item.id === itemId ? { ...item, content } : item));
  };

  const handleConfirm = async () => {
    if (!id || queue.length === 0) {
      toast.error(t('v2.campaigns.create.needOne'));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Build the batch payload, reading local files as base64 in parallel.
      const items: BatchCreateMediaItemInput[] = await Promise.all(
        queue.map(async (item): Promise<BatchCreateMediaItemInput> => {
          const content = item.content?.trim() || undefined;
          if (item.kind === 'local') {
            const base64 = await readFileAsDataUrl(item.file);
            return { kind: 'upload', itemId: item.id, label: item.file.name, base64, content };
          }
          const source: CampaignMediaImportSource = item.kind === 'library'
            ? { kind: 'library', libraryId: item.libraryId, itemId: item.itemId }
            : { kind: 'album', projectId: item.projectId, itemId: item.itemId };
          return { kind: 'import', itemId: item.id, label: item.title || item.itemId, source, content };
        }),
      );

      // Submit once; the server processes the batch asynchronously.
      let task = await batchCreateCampaignMediaPosts(id, items, watermarkSettings);
      setUploadProgress(task.completed);

      if (watermarkLoaded) {
        setIsWatermarkSaving(true);
        try {
          await updatePostWatermarkSettings(watermarkSettings);
        } catch (error) {
          toast.error(errorText(error, t('v2.campaigns.create.watermarkSaveFailed')));
        } finally {
          setIsWatermarkSaving(false);
        }
      }

      // Poll for progress until the batch finishes.
      while (task.status !== 'completed' && task.status !== 'failed') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        task = await fetchBatchCreateCampaignMediaStatus(id, task.batchId);
        setUploadProgress(task.completed);
      }

      const createdCount = task.results.filter((result) => result.ok).length;
      const failedCount = task.results.length - createdCount;

      if (task.status === 'failed' && createdCount === 0) {
        toast.error(task.error || t('v2.campaigns.create.failed'));
      } else {
        if (createdCount > 0) {
          toast.success(t('v2.campaigns.create.created', { count: createdCount, name: campaign?.name }));
        }
        if (failedCount > 0) {
          toast.error(t('v2.campaigns.create.itemsFailed', { count: failedCount }));
        }
      }

      if (createdCount > 0) {
        clearQueue();
        navigate(`/campaigns/${id}/batch`);
      }
    } catch (error) {
      toast.error(errorText(error, t('v2.campaigns.create.failed')));
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) return <LoadingState minHeight={400} />;

  return (
    <Page density="compact">
      <PageHeader
        title={t('v2.campaigns.createBatch')}
        description={
<Trans i18nKey="v2.campaigns.create.description" values={{ name: campaign?.name }} components={{ b: <strong className="text-on-surface" /> }} />
        }
        backLink={{ to: `/campaigns/${id}/batch`, label: t('v2.campaigns.create.back') }}
      />
      <div className="v2-batch-create">
        <div className="flex min-w-0 flex-col gap-4">
          <DropZone
            title={t('v2.campaigns.create.dropTitle')}
            hint="JPG, PNG, WEBP, GIF, MP4, WEBM, MOV"
            icon="upload"
            accept={POST_MEDIA_ACCEPT}
            multiple
            buttonLabel={t('v2.campaigns.create.upload')}
            disabled={isUploading}
            onFiles={handleFiles}
          >
            <div className="v2-batch-sources">
              <Text as="span" variant="label-medium" className="text-on-surface-variant">
                {t('v2.campaigns.create.orAddFrom')}
              </Text>
              <Button variant="tonal" size="sm" icon="photo_library" disabled={isUploading} onClick={() => openPicker('library')}>
                {t('v2.campaigns.create.library')}
              </Button>
              <Button variant="tonal" size="sm" icon="stacks" disabled={isUploading} onClick={() => openPicker('album')}>
                {t('v2.campaigns.create.album')}
              </Button>
            </div>
          </DropZone>
          <Section
            variant="plain"
            icon="queue"
            title={
              <>
                {t('v2.campaigns.create.queue')} {queue.length > 0 && <span className="v2-count">{queue.length}</span>}
              </>
            }
            description={queue.length > 0 ? t('v2.campaigns.create.captionsHint') : undefined}
            actions={
              queue.length > 0 && (
                <Button variant="text" size="xs" icon="clear_all" disabled={isUploading} onClick={clearQueue}>
                  {t('v2.campaigns.create.clearAll')}
                </Button>
              )
            }
          >
            {queue.length > 0 ? (
              <div className="v2-batch-queue">
                {queue.map((item, index) => {
                  const name = item.kind === 'local' ? item.file.name : item.title || item.rawUrl || item.itemId;
                  return (
                    <div key={item.id} className="v2-batch-item">
                      <div className="v2-batch-item__media">
                        {item.preview ? (
                          item.mediaType === 'video' && item.kind === 'local' ? <video src={item.preview} /> : <img src={item.kind === 'local' ? item.preview : imageDisplayUrl(item.preview)} alt="" />
                        ) : (
                          <Icon name={item.mediaType === 'video' ? 'movie' : 'image'} size={32} />
                        )}
                        <span className="v2-post-tile__pos v2-batch-item__pos">{index + 1}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Text variant="label-large" emphasized className="min-w-0 flex-1 truncate" title={name}>
                            {name}
                          </Text>
                          <span className="v2-info-chip shrink-0">
                            {t(`v2.campaigns.create.kind.${item.kind}`, { defaultValue: item.kind })} · {item.mediaType === 'video' ? t('v2.campaigns.create.video') : t('v2.campaigns.create.image')}
                          </span>
                          <IconButton icon="close" size="xs" label={t('v2.campaigns.create.removeFromQueue')} tooltip disabled={isUploading} onClick={() => removeQueueItem(item.id)} />
                        </div>
                        <TextField variant="outlined" multiline rows={3} maxRows={8} placeholder={t('v2.campaigns.create.captionPlaceholder')} aria-label={t('v2.campaigns.create.caption')} value={item.content} onValueChange={(v) => updateContent(item.id, v)} fullWidth />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon="perm_media" shape="cookie-9" title={t('v2.campaigns.create.emptyTitle')} description={t('v2.campaigns.create.emptyHint')} />
            )}
          </Section>
        </div>
        <aside className="v2-batch-create__rail">
          <WatermarkSettingsPanel settings={watermarkSettings} sampleUrl={watermarkPreviewUrl} isSaving={isWatermarkSaving} onChange={setWatermarkSettings} title={t('v2.campaigns.create.watermark')} description={t('v2.campaigns.create.watermarkHint')} statusText={t('v2.campaigns.create.watermarkStatus')} stacked />
        </aside>
      </div>
      {queue.length > 0 && (
        <FloatBar label={t('v2.campaigns.createBatch')}>
          <Text as="span" variant="label-large" emphasized className="v2-float-bar__count">
            {isUploading ? t('v2.campaigns.create.creating', { done: uploadProgress, total: queue.length }) : t('v2.campaigns.create.ready', { count: queue.length })}
          </Text>
          {isUploading && <LinearProgress value={uploadProgress} max={Math.max(1, queue.length)} className="v2-float-bar__progress" aria-label={t('v2.campaigns.create.progress')} />}
          <span className="v2-float-bar__actions">
            <Button variant="text" size="sm" disabled={isUploading} href={`/campaigns/${id}/batch`}>
              {t('confirmModal.cancel', 'Cancel')}
            </Button>
            <Button variant="filled" size="sm" icon="check" loading={isUploading} onClick={() => void handleConfirm()}>
              {t('v2.campaigns.create.confirm', { count: queue.length })}
            </Button>
          </span>
        </FloatBar>
      )}
      <MediaPicker
        isOpen={pickerMode !== null}
        allowedTypes={['image', 'video']}
        defaultSourceKind={pickerMode || 'library'}
        memoryKey={`campaign-media:${pickerMode || 'library'}`}
        multiple
        onClose={closePicker}
        onConfirm={addPickedItemsToQueue}
      />
    </Page>
  );
}
