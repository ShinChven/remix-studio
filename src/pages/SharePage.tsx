import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Image as ImageIcon, Type, Layers, Folder, MessageCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../components/PageHeader';
import { stashPwaShareHandoff, type PwaShareHandoffInput } from '../lib/pwa-share';

const SHARE_CACHE = 'remix-studio-share-v1';
const SHARE_PREFIX = '/__share-cache/';
const META_KEY = `${SHARE_PREFIX}meta.json`;

// A share lands here within a second of being sent. Anything older is left
// over from a session that never finished, and is cleared rather than shown.
const SHARE_MAX_AGE_MS = 15 * 60 * 1000;

type FileMeta = {
  key: string;
  name: string;
  type: string;
  size?: number;
};

type ShareDiagnostics = {
  fieldNames?: string[];
  fileCount?: number;
  unreadableFiles?: number;
  contentType?: string;
};

type ShareMeta = {
  text: string;
  title: string;
  url: string;
  extras?: string[];
  files: FileMeta[];
  diagnostics?: ShareDiagnostics;
  receivedAt?: number;
};

type SharedImage = {
  name: string;
  type: string;
  blob: Blob;
  objectUrl: string;
};

type LoadedShare = {
  text: string;
  title: string;
  url: string;
  images: SharedImage[];
  diagnostics: ShareDiagnostics;
  /** Files the worker recorded that were no longer readable from the cache. */
  missingFiles: number;
};

async function openShareCache(): Promise<Cache | null> {
  if (!('caches' in window)) return null;
  try {
    return await caches.open(SHARE_CACHE);
  } catch {
    return null;
  }
}

/**
 * Reads the payload the service worker stashed. Nothing is deleted here: the
 * page can mount more than once for a single share (a remount while auth
 * resolves, React's double-invoked effects in development, a pull-to-refresh),
 * and a read that consumed the payload left the second pass rendering an empty
 * preview. The cache is cleared once the share has actually been acted on.
 */
async function loadShare(): Promise<LoadedShare | null> {
  const cache = await openShareCache();
  if (!cache) return null;

  const metaRes = await cache.match(META_KEY);
  if (!metaRes) return null;

  const meta = (await metaRes.json()) as ShareMeta;

  if (meta.receivedAt && Date.now() - meta.receivedAt > SHARE_MAX_AGE_MS) {
    await clearShare();
    return null;
  }

  const images: SharedImage[] = [];
  let missingFiles = 0;
  for (const file of meta.files || []) {
    const fileRes = await cache.match(`${SHARE_PREFIX}${file.key}`);
    if (!fileRes) {
      missingFiles += 1;
      continue;
    }
    const blob = await fileRes.blob();
    images.push({
      name: file.name || '',
      type: file.type || blob.type,
      blob,
      objectUrl: URL.createObjectURL(blob),
    });
  }

  const textParts = [meta.text, ...(meta.extras || [])].filter(Boolean);

  return {
    text: textParts.join('\n').trim(),
    title: meta.title || '',
    url: meta.url || '',
    images,
    diagnostics: meta.diagnostics || {},
    missingFiles,
  };
}

async function clearShare(): Promise<void> {
  const cache = await openShareCache();
  if (!cache) return;
  try {
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => cache.delete(req)));
  } catch {
    // A share that outlives its cache entry is harmless; it ages out.
  }
}

function describeDiagnostics(share: LoadedShare): string {
  const { unreadableFiles, fieldNames } = share.diagnostics;
  if (share.missingFiles > 0) {
    return `The shared ${share.missingFiles === 1 ? 'file' : 'files'} could not be read back from storage. Sharing again usually works.`;
  }
  if (unreadableFiles) {
    return `The other app offered ${unreadableFiles === 1 ? 'a file' : `${unreadableFiles} files`} that the browser could not open. Try sharing from the gallery, or save the image first and share the saved copy.`;
  }
  if (fieldNames && fieldNames.length > 0) {
    return `The share arrived with no content in it (fields received: ${fieldNames.join(', ')}).`;
  }
  return 'The share arrived with nothing in it.';
}

export default function SharePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const swError = searchParams.get('error');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'empty'>('loading');
  const [share, setShare] = useState<LoadedShare | null>(null);
  const [handingOff, setHandingOff] = useState(false);
  const shareRef = useRef<LoadedShare | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadShare()
      .then((loaded) => {
        if (cancelled) {
          loaded?.images.forEach((img) => URL.revokeObjectURL(img.objectUrl));
          return;
        }
        // A payload with neither text nor an image is a failed share, not a
        // share of nothing: it gets the diagnostic screen rather than an empty
        // preview with buttons that cannot do anything.
        const usable = loaded && (loaded.images.length > 0 || loaded.text || loaded.title || loaded.url);
        shareRef.current = loaded;
        setShare(loaded);
        setStatus(usable ? 'loaded' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setStatus('empty');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      shareRef.current?.images.forEach((img) => URL.revokeObjectURL(img.objectUrl));
    };
  }, []);

  const buildHandoff = (): PwaShareHandoffInput | null => {
    if (!share) return null;
    if (share.images.length > 0) {
      const img = share.images[0];
      const name = img.name || share.title || share.text || 'Shared image';
      return { type: 'image', blob: img.blob, name };
    }
    const combined = [share.title, share.text, share.url].filter(Boolean).join('\n').trim();
    if (combined) return { type: 'text', data: combined };
    return null;
  };

  const handOff = async (destination: string, extraCount: string) => {
    if (handingOff) return;
    const payload = buildHandoff();
    if (!payload) {
      toast.error('Nothing to share');
      return;
    }
    if (share && share.images.length > 1) {
      toast.warning(`Only the first of ${share.images.length} images will be ${extraCount}`);
    }
    setHandingOff(true);
    try {
      const ok = await stashPwaShareHandoff(payload);
      if (!ok) {
        toast.error('Shared content is too large to hand off');
        return;
      }
      await clearShare();
      navigate(destination);
    } finally {
      setHandingOff(false);
    }
  };

  const handleCancel = () => {
    void clearShare();
    navigate('/');
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
    const failed = Boolean(swError) || Boolean(share);
    const detail = swError
      ? `Something went wrong handling the shared content: ${swError}`
      : share
        ? describeDiagnostics(share)
        : 'Share text or an image to Remix Studio from another app to see it here.';
    return (
      <div className="h-full flex flex-col p-4 md:p-8 items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${failed ? 'bg-red-100 dark:bg-red-950/40' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          {failed ? <AlertTriangle className="w-8 h-8 text-red-500" /> : <ImageIcon className="w-8 h-8 text-neutral-400" />}
        </div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {failed ? 'Share Failed' : 'No Shared Content'}
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 max-w-md text-sm">{detail}</p>
        <button onClick={handleCancel} className="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl shadow hover:bg-blue-700 transition-all mt-4">
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
          backLink={{ label: 'Cancel', onClick: handleCancel }}
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
              <img src={share.images[0].objectUrl} alt="Shared preview" className="max-h-[400px] max-w-full rounded-lg object-contain" />
            ) : (
              <div className="w-full overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 font-mono text-sm dark:bg-neutral-900 max-h-[400px]">
                {previewText}
              </div>
            )}
          </div>
          {hasImage && previewText && (
            <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              {previewText}
            </div>
          )}
          {share.missingFiles > 0 && (
            <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {share.missingFiles === 1 ? 'One shared file' : `${share.missingFiles} shared files`} could not be read back and {share.missingFiles === 1 ? 'is' : 'are'} not included.
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => handOff('/import?destination=library', 'saved')}
            disabled={handingOff}
            className="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm font-bold text-neutral-900 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-60 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
          >
            <Layers className="h-5 w-5 text-blue-500" />
            Save to Library
          </button>
          <button
            onClick={() => handOff('/import?destination=project', 'saved')}
            disabled={handingOff}
            className="flex items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-sm font-bold text-neutral-900 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-60 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
          >
            <Folder className="h-5 w-5 text-blue-500" />
            Save to Project
          </button>
          <button
            onClick={() => handOff('/assistant', 'attached')}
            disabled={handingOff}
            className="flex items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
          >
            <MessageCircle className="h-5 w-5" />
            Start a Chat
          </button>
        </div>
      </div>
    </div>
  );
}
