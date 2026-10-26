import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { stashPwaShareHandoff, type PwaShareHandoffInput } from '../../lib/pwa-share';
import { Button, Icon, Text, useSnackbar } from '../../m3';
import { clearShare, describeDiagnostics, loadShare, type LoadedShare } from '../lib/shareInbox';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

/** Content shared to the installed app from another app, and where to send it. */
export function SharePage() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
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
        // A payload with neither text nor an image is a failed share: it gets the diagnosis.
        const usable = loaded && (loaded.images.length > 0 || loaded.text || loaded.title || loaded.url);
        shareRef.current = loaded;
        setShare(loaded);
        setStatus(usable ? 'loaded' : 'empty');
      })
      .catch(() => !cancelled && setStatus('empty'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => shareRef.current?.images.forEach((img) => URL.revokeObjectURL(img.objectUrl)), []);

  const buildHandoff = (): PwaShareHandoffInput | null => {
    if (!share) return null;
    if (share.images.length > 0) {
      const img = share.images[0];
      return { type: 'image', blob: img.blob, name: img.name || share.title || share.text || 'Shared image' };
    }
    const combined = [share.title, share.text, share.url].filter(Boolean).join('\n').trim();
    return combined ? { type: 'text', data: combined } : null;
  };

  const handOff = async (destination: string, verb: string) => {
    if (handingOff) return;
    const payload = buildHandoff();
    if (!payload) {
      snackbar.show('Nothing to share');
      return;
    }
    if (share && share.images.length > 1) snackbar.show(`Only the first of ${share.images.length} images will be ${verb}`);
    setHandingOff(true);
    try {
      if (!(await stashPwaShareHandoff(payload))) {
        snackbar.show('Shared content is too large to hand off');
        return;
      }
      await clearShare();
      navigate(destination);
    } finally {
      setHandingOff(false);
    }
  };

  const cancel = () => {
    void clearShare();
    navigate('/');
  };

  if (status === 'loading') return <LoadingState label="Loading shared content..." minHeight={400} />;

  if (status === 'empty' || !share) {
    const failed = Boolean(swError) || Boolean(share);
    const detail = swError ? `Something went wrong handling the shared content: ${swError}` : share ? describeDiagnostics(share) : 'Share text or an image to Remix Studio from another app to see it here.';
    return (
      <Page>
        <EmptyState
          icon={failed ? 'warning' : 'image'}
          shape={failed ? 'boom' : 'cookie-9'}
          title={failed ? 'Share Failed' : 'No Shared Content'}
          description={detail}
          action={
            <Button variant="filled" onClick={cancel}>
              Go to Home
            </Button>
          }
        />
      </Page>
    );
  }

  const hasImage = share.images.length > 0;
  const previewText = [share.title, share.text, share.url].filter(Boolean).join('\n').trim();

  return (
    <Page width="narrow">
      <PageHeader title="Shared with Remix Studio" description="Choose where to send this content." backLink={{ label: 'Cancel', onClick: cancel }} />
      <div className="flex flex-col gap-5">
        <Section variant="card" icon={<Icon name={hasImage ? 'image' : 'notes'} />} title="Preview" actions={share.images.length > 1 ? <StatusPill tone="warning">Showing 1 of {share.images.length}</StatusPill> : undefined}>
          <div className="v2-import-preview">{hasImage ? <img src={share.images[0].objectUrl} alt="Shared preview" /> : <pre>{previewText}</pre>}</div>
          {hasImage && previewText && (
            <Text variant="body-small" className="v2-notice">
              {previewText}
            </Text>
          )}
          {share.missingFiles > 0 && (
            <div className="v2-notice" data-tone="warning">
              <Icon name="warning" />
              <Text variant="body-small">
                {share.missingFiles === 1 ? 'One shared file' : `${share.missingFiles} shared files`} could not be read back and {share.missingFiles === 1 ? 'is' : 'are'} not included.
              </Text>
            </div>
          )}
        </Section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Button variant="tonal" size="md" icon="layers" disabled={handingOff} onClick={() => void handOff('/import?destination=library', 'saved')}>
            Save to Library
          </Button>
          <Button variant="tonal" size="md" icon="folder" disabled={handingOff} onClick={() => void handOff('/import?destination=project', 'saved')}>
            Save to Project
          </Button>
          <Button variant="filled" size="md" icon="chat" disabled={handingOff} onClick={() => void handOff('/assistant', 'attached')} emphasized>
            Start a Chat
          </Button>
        </div>
      </div>
    </Page>
  );
}
