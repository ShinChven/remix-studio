import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { addPostMedia, createPost, fetchCampaign, saveImage, saveVideo } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

const POST_MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime';

interface BatchDraftPost {
  id: string;
  file: File;
  preview: string;
  content: string;
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

export function CampaignBatchCreate() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [posts, setPosts] = useState<BatchDraftPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await fetchCampaign(id);
      setCampaign(data);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load campaign');
      navigate('/campaigns');
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void loadCampaign();
    return () => {
      setPosts((items) => {
        for (const item of items) URL.revokeObjectURL(item.preview);
        return items;
      });
    };
  }, [loadCampaign]);

  const handleFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files);
    const unsupported = nextFiles.find((file) => !file.type.startsWith('image/') && !file.type.startsWith('video/'));
    if (unsupported) {
      toast.error('Only images, GIFs, and videos are supported');
      return;
    }
    const drafts = nextFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      content: '',
    }));
    setPosts((prev) => [...prev, ...drafts]);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };

  const removePost = (postId: string) => {
    setPosts((prev) => {
      const item = prev.find((post) => post.id === postId);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((post) => post.id !== postId);
    });
  };

  const updateContent = (postId: string, content: string) => {
    setPosts((prev) => prev.map((post) => post.id === postId ? { ...post, content } : post));
  };

  const handleConfirm = async () => {
    if (!id || posts.length === 0) {
      toast.error('Please add at least one media file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    let successCount = 0;
    try {
      for (let i = 0; i < posts.length; i++) {
        const draft = posts[i];
        const post = await createPost({
          campaignId: id,
          textContent: draft.content,
          status: 'draft',
        });
        const mediaType = getFileMediaType(draft.file);
        const base64 = await readFileAsDataUrl(draft.file);
        const uploaded = mediaType === 'video'
          ? await saveVideo(base64, id)
          : await saveImage(base64, id);
        await addPostMedia(post.id, { sourceUrl: uploaded.key, type: mediaType });
        successCount++;
        setUploadProgress(i + 1);
      }

      toast.success(`Successfully created ${successCount} posts for ${campaign?.name}`);
      navigate(`/campaigns/${id}/batch`);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred during batch creation');
    } finally {
      setIsUploading(false);
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
      <div className="w-full space-y-8 pb-32">
        <PageHeader
          title="Create Batch"
          description={<>Upload image, GIF, or video posts for <span className="font-semibold text-neutral-950 dark:text-white">{campaign?.name}</span></>}
          backLink={{ to: `/campaigns/${id}/batch`, label: 'Back to Batch Actions' }}
          actions={(
            <div className="flex items-center gap-3">
              <button className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/${id}/batch`)}>Cancel</button>
              <button className="inline-flex h-10 min-w-[150px] items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60" onClick={() => void handleConfirm()} disabled={isUploading || posts.length === 0}>
                {isUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploadProgress}/{posts.length}...</> : <><CheckCircle2 className="h-4 w-4" /> Confirm Batch</>}
              </button>
            </div>
          )}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (event.dataTransfer.files.length > 0) handleFiles(event.dataTransfer.files);
          }}
          className={cn(
            'group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[2.5rem] border-2 border-dashed p-12 transition-all',
            isDragging
              ? 'scale-[0.99] border-indigo-500/50 bg-indigo-500/10 shadow-inner'
              : 'border-neutral-200 bg-white/40 hover:border-indigo-500/30 hover:bg-white/60 dark:border-neutral-800 dark:bg-neutral-900/40 dark:hover:border-indigo-500/30 dark:hover:bg-neutral-800/60',
          )}
        >
          <input type="file" multiple accept={POST_MEDIA_ACCEPT} className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <div className={cn('flex h-16 w-16 items-center justify-center rounded-full border shadow-sm transition-all', isDragging ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-neutral-200 bg-white text-neutral-500 group-hover:text-indigo-500 dark:border-white/10 dark:bg-neutral-900')}>
            <Upload className={cn('h-8 w-8', isDragging && 'animate-bounce')} />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-neutral-950 dark:text-white">{isDragging ? 'Drop files to upload' : 'Drag and drop images, GIFs, or video here'}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">or click to browse from your computer</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <span>JPG, PNG, WEBP, GIF, MP4</span>
            <span className="h-1 w-1 rounded-full bg-neutral-400" />
            <span>1 media file per post</span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-bold text-neutral-950 dark:text-white">
              Batch Items
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">{posts.length}</span>
            </h2>
            {posts.length > 0 && (
              <button className="rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-500/10" onClick={() => {
                for (const post of posts) URL.revokeObjectURL(post.preview);
                setPosts([]);
              }}>Clear All</button>
            )}
          </div>

          {posts.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {posts.map((post) => (
                <div key={post.id} className="group overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
                  <div className="flex h-48">
                    <div className="relative w-1/3 bg-neutral-100 dark:bg-neutral-800">
                      {getFileMediaType(post.file) === 'video' ? <video src={post.preview} className="h-full w-full object-cover" /> : <img src={post.preview} alt="" className="h-full w-full object-cover" />}
                      <button className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white opacity-0 transition-opacity group-hover:opacity-100" onClick={(event) => { event.stopPropagation(); removePost(post.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Post Content</span>
                        {getFileMediaType(post.file) === 'video' || getFileMediaType(post.file) === 'gif' ? (
                          <span className="rounded bg-neutral-950/10 px-1 text-[9px] font-bold uppercase text-neutral-700 dark:bg-white/10 dark:text-neutral-200">{getFileMediaType(post.file)}</span>
                        ) : (
                          <ImageIcon className="h-3.5 w-3.5 text-neutral-300" />
                        )}
                      </div>
                      <textarea className="min-h-0 flex-1 resize-none rounded-xl border border-neutral-200/50 bg-white/40 p-3 text-sm outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white" placeholder="Enter caption for this post..." value={post.content} onChange={(event) => updateContent(post.id, event.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-100/20 text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-100/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20">
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Add more items</span>
              </button>
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-neutral-200 bg-white/40 shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40">
              <ImageIcon className="mb-4 h-12 w-12 text-neutral-300" />
              <p className="font-medium text-neutral-500 dark:text-neutral-400">No files uploaded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
