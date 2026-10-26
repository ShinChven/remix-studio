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
import { Button, Icon, IconButton, Text, TextField } from '../../m3';
import { MediaPicker, type UniversalPickedItem } from '../components/MediaPicker';
import { DEFAULT_WATERMARK_SETTINGS, WatermarkSettingsPanel } from '../components/WatermarkSettingsPanel';
import { DropZone } from '../ui/DropZone';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { useToast } from '../ui/useToast';

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

function mediaSourceLabel(type: MediaType) {
  return type === 'video' ? 'Video' : 'Image';
}

function getFileMediaType(file: File): MediaType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}


/** Queues media from uploads, libraries or albums, one post each with its own caption, with an optional watermark. */
export function CampaignBatchCreate() {
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
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
          toast.error('Failed to load watermark settings');
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
          toast.error((error as Error)?.message || 'Failed to load campaign');
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
      toast.success(`Added ${additions.length} item${additions.length === 1 ? '' : 's'} to queue`);
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    const unsupported = nextFiles.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
    if (unsupported) {
      toast.error('Only images and videos are supported');
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
      toast.error('Please add at least one media item');
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
          toast.error((error as Error)?.message || 'Failed to save watermark settings');
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
        toast.error(task.error || 'Failed to create batch');
      } else {
        if (createdCount > 0) {
          toast.success(`Successfully created ${createdCount} post${createdCount === 1 ? '' : 's'} for ${campaign?.name}`);
        }
        if (failedCount > 0) {
          toast.error(`Failed to process ${failedCount} item${failedCount === 1 ? '' : 's'}`);
        }
      }

      if (createdCount > 0) {
        clearQueue();
        navigate(`/campaigns/${id}/batch`);
      }
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to create batch');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) return <LoadingState minHeight={400} />;

  return (
    <Page density="compact">
      <PageHeader
        title="Create Batch"
        description={
          <>
            Queue media from uploads, libraries, or albums for <strong className="text-on-surface">{campaign?.name}</strong>
          </>
        }
        backLink={{ to: `/campaigns/${id}/batch`, label: 'Back to Batch Actions' }}
        actions={
          <>
            <Button variant="text" href={`/campaigns/${id}/batch`}>
              Cancel
            </Button>
            <Button variant="filled" icon="check_circle" loading={isUploading} disabled={queue.length === 0} onClick={() => void handleConfirm()}>
              {isUploading ? `Processing ${uploadProgress}/${queue.length}...` : 'Confirm Batch'}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="tonal" icon="photo_library" onClick={() => openPicker('library')}>
            Pick Library
          </Button>
          <Button variant="tonal" icon="stacks" onClick={() => openPicker('album')}>
            Pick Album
          </Button>
          <Text variant="label-medium" className="ms-auto text-on-surface-variant">
            {queue.length} queued · 1 media item per post
          </Text>
        </div>
        <WatermarkSettingsPanel settings={watermarkSettings} sampleUrl={watermarkPreviewUrl} isSaving={isWatermarkSaving} onChange={setWatermarkSettings} />
        <DropZone
          title="Drag and drop images or video here"
          hint="JPG, PNG, WEBP, GIF, MP4 · Library and album picks use the same queue below"
          icon="upload"
          accept={POST_MEDIA_ACCEPT}
          multiple
          buttonLabel="Upload Files"
          onFiles={handleFiles}
        />
        <Section
          variant="plain"
          icon="queue"
          title={
            <>
              Batch Queue <span className="v2-count">{queue.length}</span>
            </>
          }
          actions={
            queue.length > 0 && (
              <Button variant="text" size="xs" icon="clear_all" onClick={clearQueue}>
                Clear All
              </Button>
            )
          }
        >
          {queue.length > 0 ? (
            <div className="v2-batch-queue">
              {queue.map((item) => {
                const name = item.kind === 'local' ? item.file.name : item.title || item.rawUrl || item.itemId;
                return (
                  <div key={item.id} className="v2-batch-item">
                    <div className="v2-batch-item__media">
                      {item.preview ? (
                        item.mediaType === 'video' && item.kind === 'local' ? <video src={item.preview} /> : <img src={item.kind === 'local' ? item.preview : imageDisplayUrl(item.preview)} alt="" />
                      ) : (
                        <Icon name={item.mediaType === 'video' ? 'movie' : 'image'} size={32} />
                      )}
                      <IconButton icon="delete" size="xs" variant="filled" className="v2-button-danger v2-batch-item__remove" label="Remove" onClick={() => removeQueueItem(item.id)} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Text variant="label-large" emphasized className="truncate" title={name}>
                          {name}
                        </Text>
                        <span className="v2-info-chip">
                          {item.kind} · {mediaSourceLabel(item.mediaType)}
                        </span>
                      </div>
                      <TextField variant="outlined" multiline rows={3} maxRows={8} placeholder="Enter caption for this post..." aria-label="Caption" value={item.content} onValueChange={(v) => updateContent(item.id, v)} fullWidth />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="image" size="inline" title="No media queued yet" />
          )}
        </Section>
      </div>
      <MediaPicker
        isOpen={pickerMode !== null}
        title="Media Picker"
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
