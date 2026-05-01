import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  GripVertical,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addPostMedia,
  createPost,
  fetchCampaign,
  fetchPost,
  removePostMedia,
  saveImage,
  saveVideo,
  updatePost,
} from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

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

function toDatetimeLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function mediaPreviewUrl(media: Pick<PostMedia, 'thumbnailUrl' | 'processedUrl' | 'sourceUrl'>) {
  const value = media.thumbnailUrl || media.processedUrl || media.sourceUrl || '';
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return `/api/storage/${value}`;
}

function accountName(account: SocialAccount) {
  return account.profileName || account.accountId || account.platform;
}

function fallbackAvatar(id: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

function getFileMediaType(file: File): 'image' | 'video' | 'gif' {
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function NewFilePreview({ file }: { file: File }) {
  const [preview, setPreview] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!preview) return <div className="h-full w-full animate-pulse bg-neutral-200 dark:bg-neutral-800" />;
  if (file.type.startsWith('video/')) {
    return <video src={preview} className="h-full w-full object-cover" muted playsInline />;
  }
  return <img src={preview} alt="" className="h-full w-full object-cover" />;
}

export function PostForm() {
  const { campaignId, postId } = useParams<{ campaignId: string; postId: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(postId);
  const [campaign, setCampaign] = useState<any>(null);
  const [content, setContent] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [existingMedia, setExistingMedia] = useState<PostMedia[]>([]);
  const [removedMediaIds, setRemovedMediaIds] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mediaToRemove, setMediaToRemove] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    } catch (error: any) {
      toast.error(error?.message || 'Error loading post');
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

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const supported = files.filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (supported.length !== files.length) {
      toast.error('Only images, GIFs, and videos are supported');
      return;
    }
    if (totalMediaCount + supported.length > 4) {
      toast.error('Maximum 4 media items allowed per post');
      return;
    }
    setNewFiles((prev) => [...prev, ...supported]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const handleSave = async () => {
    if (!campaignId) return;
    if (!content.trim() && totalMediaCount === 0) {
      toast.error('Post must have text or media');
      return;
    }
    if (scheduledAt && new Date(scheduledAt) < new Date(Date.now() + 5 * 60_000)) {
      toast.error('Scheduled time must be at least 5 minutes in the future.');
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

      toast.success(isEditing ? 'Post updated successfully' : 'Post created successfully');
      navigate(`/campaigns/${campaignId}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save post');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={isEditing ? 'Edit Post' : 'Create New Post'}
          description={isEditing ? 'Update your campaign post.' : 'Add a new post to your campaign.'}
          backLink={{ label: 'Back', onClick: () => navigate(-1) }}
        />

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">Content & Media</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">What would you like to share?</p>
              </div>
              <div className="space-y-6 p-6">
                <div className="grid gap-2">
                  <label htmlFor="post-content" className="font-semibold text-neutral-950 dark:text-white">Post Content</label>
                  <textarea
                    id="post-content"
                    placeholder="Type your post content here..."
                    className="min-h-[220px] resize-none rounded-xl border border-neutral-200/50 bg-white/40 p-4 text-base leading-relaxed text-neutral-950 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white"
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                  />
                  <div className="flex justify-end text-xs font-bold text-neutral-400">{content.length} / 280</div>
                </div>

                <div
                  className="grid gap-4"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="font-semibold text-neutral-950 dark:text-white">Media</label>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-neutral-400">{totalMediaCount}/4</span>
                      <button
                        type="button"
                        className="flex h-9 items-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:hover:bg-white/10"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus className="h-4 w-4" />
                        Add Files
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={POST_MEDIA_ACCEPT}
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>

                  {(visibleExistingMedia.length > 0 || newFiles.length > 0) ? (
                    <div className={cn('space-y-3 rounded-xl p-2 transition-all', isDragging && 'bg-indigo-500/10 ring-2 ring-indigo-500/40 ring-dashed')}>
                      {isDragging ? (
                        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-500/50 bg-indigo-500/10 py-12">
                          <Upload className="h-8 w-8 animate-bounce text-indigo-600 dark:text-indigo-400" />
                          <p className="font-bold text-neutral-950 dark:text-white">Drop files to add</p>
                        </div>
                      ) : null}
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">Drag files onto this area or use Add Files.</p>

                      {visibleExistingMedia.map((media) => {
                        const preview = mediaPreviewUrl(media);
                        return (
                          <div key={media.id} className="flex min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100/40 p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                            <div className="h-8 w-8 shrink-0 cursor-grab rounded-full text-neutral-400">
                              <GripVertical className="mx-auto h-4 w-4" />
                            </div>
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800">
                              {preview && media.type !== 'video' ? (
                                <img src={preview} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-400">{media.type || 'media'}</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">{media.sourceUrl.split('/').pop()}</div>
                            <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs font-bold uppercase text-neutral-500 dark:border-white/10">Existing</span>
                            <button className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-red-500/10 hover:text-red-600" onClick={() => setMediaToRemove(media.id)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}

                      {newFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-4 overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 shadow-sm">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800">
                            <NewFilePreview file={file} />
                          </div>
                          <div className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-950 dark:text-white">{file.name}</div>
                          <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs font-bold uppercase text-neutral-500 dark:border-white/10">{getFileMediaType(file)}</span>
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold uppercase text-white">New</span>
                          <button className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-red-500/10 hover:text-red-600" onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'cursor-pointer rounded-2xl border-2 border-dashed py-12 text-center transition-all',
                        isDragging ? 'scale-[0.99] border-indigo-500/50 bg-indigo-500/10 shadow-inner' : 'border-neutral-200 bg-white/40 hover:border-indigo-500/30 hover:bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/40 dark:hover:border-indigo-500/30',
                      )}
                    >
                      <div className={cn('mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full transition-all', isDragging ? 'bg-indigo-600 text-white' : 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400')}>
                        {isDragging ? <Upload className="h-6 w-6" /> : <ImagePlus className="h-6 w-6" />}
                      </div>
                      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        {isDragging ? 'Drop files to upload' : 'No media added yet. Drag and drop or click Add Files.'}
                      </p>
                      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Add images, GIFs, or video. Limits vary by platform.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-6 lg:col-span-1">
            <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">Scheduling</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">When should this be published?</p>
              </div>
              <div className="space-y-6 p-6">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="scheduledAt" className="font-semibold text-neutral-950 dark:text-white">Scheduled Time</label>
                    {scheduledAt && (
                      <button className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white" onClick={() => setScheduledAt('')}>
                        <X className="h-3 w-3" />
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="relative flex h-11 items-center overflow-hidden rounded-xl border border-neutral-200/50 bg-white/40 shadow-sm transition-colors focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40">
                    <Calendar className="pointer-events-none absolute left-3 h-4 w-4 shrink-0 text-neutral-400" />
                    <input
                      id="scheduledAt"
                      type="datetime-local"
                      className="absolute inset-0 h-full w-full bg-transparent pl-10 pr-3 text-sm text-neutral-950 outline-none dark:text-white [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                      style={!scheduledAt ? { color: 'transparent' } : undefined}
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                    />
                    {!scheduledAt && <span className="pointer-events-none pl-10 text-sm text-neutral-500">Not scheduled</span>}
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                    Leave empty to save as a draft. Posts will be automatically published at the selected time.
                  </p>
                </div>

                <div className="h-px bg-neutral-200 dark:bg-white/10" />

                <div className="space-y-3">
                  <label className="font-semibold text-neutral-950 dark:text-white">Target Channels</label>
                  {targetAccounts.length > 0 && (
                    <div className="flex -space-x-2">
                      {targetAccounts.map((account) => (
                        <div key={account.id} className="h-10 w-10 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 ring-4 ring-white dark:border-white/10 dark:bg-neutral-800 dark:ring-neutral-900" title={`${accountName(account)} (${account.platform})`}>
                          <img src={account.avatarUrl || fallbackAvatar(account.id)} alt={accountName(account)} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {targetAccounts.length > 0
                      ? `This post will be sent to all ${targetAccounts.length} channels connected to this campaign.`
                      : 'No channels connected to this campaign. Please connect channels in campaign settings.'}
                  </p>
                </div>
              </div>
              <div className="border-t border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => void handleSave()}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-indigo-700 bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60"
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? 'Update Post' : 'Create Post'}
                  </button>
                  <button
                    onClick={() => navigate(`/campaigns/${campaignId}`)}
                    className="h-11 w-full rounded-xl font-bold text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-950 dark:hover:bg-white/10 dark:hover:text-white"
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-emerald-500/10 bg-emerald-500/5 p-6">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <Send className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-600">Ready to go?</h4>
                  <p className="mt-1 text-sm text-emerald-600/70">
                    You can also send this post immediately from the campaign dashboard.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {mediaToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setMediaToRemove(null)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Remove Media</h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Are you sure you want to remove this existing media file? It will be removed when you save the post.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10" onClick={() => setMediaToRemove(null)}>
                Cancel
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                onClick={() => {
                  setRemovedMediaIds((prev) => new Set(prev).add(mediaToRemove));
                  setMediaToRemove(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
