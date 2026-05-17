import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, Type, FolderPlus, MessageCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { stashPwaShareHandoff, type PwaShareHandoff } from '../lib/pwa-share';

const SHARE_CACHE = 'remix-studio-share-v1';
const META_KEY = '/__share-cache/meta.json';

type FileMeta = {
  key: string;
  name: string;
  type: string;
};

type ShareMeta = {
  text: string;
  title: string;
  url: string;
  files: FileMeta[];
};

type LoadedShare = {
  text: string;
  title: string;
  url: string;
  images: { name: string; dataUrl: string }[];
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

export default function SharePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const swError = searchParams.get('error');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'empty'>('loading');
  const [share, setShare] = useState<LoadedShare | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!('caches' in window)) {
        if (!cancelled) setStatus('empty');
        return;
      }
      try {
        const cache = await caches.open(SHARE_CACHE);
        const metaRes = await cache.match(META_KEY);
        if (!metaRes) {
          if (!cancelled) setStatus('empty');
          return;
        }
        const meta = (await metaRes.json()) as ShareMeta;
        const images: { name: string; dataUrl: string }[] = [];
        for (const file of meta.files || []) {
          const fileRes = await cache.match(`/__share-cache/${file.key}`);
          if (!fileRes) continue;
          const blob = await fileRes.blob();
          const dataUrl = await blobToDataUrl(blob);
          images.push({ name: file.name, dataUrl });
        }

        // Clean up cache so refreshes don't replay
        await cache.delete(META_KEY);
        for (const file of meta.files || []) {
          await cache.delete(`/__share-cache/${file.key}`);
        }

        if (cancelled) return;
        setShare({
          text: meta.text || '',
          title: meta.title || '',
          url: meta.url || '',
          images,
        });
        setStatus('loaded');
      } catch (e) {
        if (!cancelled) setStatus('empty');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const buildHandoff = (): PwaShareHandoff | null => {
    if (!share) return null;
    if (share.images.length > 0) {
      const img = share.images[0];
      const name = img.name || share.title || share.text || 'Shared image';
      return { type: 'image', data: img.dataUrl, name };
    }
    const textParts = [share.title, share.text, share.url].filter(Boolean);
    const combined = textParts.join('\n').trim();
    if (combined) {
      return { type: 'text', data: combined };
    }
    return null;
  };

  const handoffOrNotify = (payload: PwaShareHandoff | null) => {
    if (!payload) {
      toast.error('Nothing to share');
      return false;
    }
    const ok = stashPwaShareHandoff(payload);
    if (!ok) {
      toast.error('Shared content is too large to hand off');
      return false;
    }
    return true;
  };

  const handleSendToImport = () => {
    const payload = buildHandoff();
    if (share && share.images.length > 1) {
      toast.warning(`Only the first of ${share.images.length} images will be saved`);
    }
    if (!handoffOrNotify(payload)) return;
    navigate('/import');
  };

  const handleSendToChat = () => {
    const payload = buildHandoff();
    if (share && share.images.length > 1) {
      toast.warning(`Only the first of ${share.images.length} images will be attached`);
    }
    if (!handoffOrNotify(payload)) return;
    navigate('/assistant');
  };

  if (status === 'loading') {
    return (
      <div className="h-full flex flex-col p-4 md:p-8 items-center justify-center min-h-[60vh] text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-neutral-500 dark:text-neutral-400 font-medium text-sm">Loading shared content...</p>
      </div>
    );
  }

  if (status === 'empty' || !share) {
    return (
      <div className="h-full flex flex-col p-4 md:p-8 items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${swError ? 'bg-red-100 dark:bg-red-950/40' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          {swError ? <AlertTriangle className="w-8 h-8 text-red-500" /> : <ImageIcon className="w-8 h-8 text-neutral-400" />}
        </div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {swError ? 'Share Failed' : 'No Shared Content'}
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 max-w-md text-sm">
          {swError
            ? `Something went wrong handling the shared content: ${swError}`
            : 'Share text or an image to Remix Studio from another app to see it here.'}
        </p>
        <button onClick={() => navigate('/')} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow hover:bg-blue-700 transition-all mt-4">
          Go to Home
        </button>
      </div>
    );
  }

  const hasImage = share.images.length > 0;
  const previewText = [share.title, share.text, share.url].filter(Boolean).join('\n').trim();

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PageHeader
          title="Shared with Remix Studio"
          description="Choose where to send this content."
          backLink={{ label: 'Cancel', onClick: () => navigate('/') }}
        />

        <div className="space-y-3 rounded-lg border border-neutral-200/70 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/55">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
              {hasImage ? <ImageIcon className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
              Preview
            </label>
            {share.images.length > 1 && (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                Showing 1 of {share.images.length}
              </span>
            )}
          </div>
          <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950">
            {hasImage ? (
              <img src={share.images[0].dataUrl} alt="Shared preview" className="max-h-[400px] max-w-full rounded-lg object-contain" />
            ) : (
              <div className="w-full overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 font-mono text-sm dark:bg-neutral-900 max-h-[400px]">
                {previewText || '(empty)'}
              </div>
            )}
          </div>
          {hasImage && previewText && (
            <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              {previewText}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={handleSendToImport}
            className="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm font-bold text-neutral-900 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
          >
            <FolderPlus className="h-5 w-5 text-blue-500" />
            Save to Library or Project
          </button>
          <button
            onClick={handleSendToChat}
            className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98]"
          >
            <MessageCircle className="h-5 w-5" />
            Start a Chat
          </button>
        </div>
      </div>
    </div>
  );
}
