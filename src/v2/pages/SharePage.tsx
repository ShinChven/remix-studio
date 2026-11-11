import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { stashPwaShareHandoff, type PwaShareHandoffInput } from '../../lib/pwa-share';
import { Button, Icon, Text } from '../../m3';
import { clearShare, describeDiagnostics, loadShare, type LoadedShare } from '../lib/shareInbox';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

/** Content shared to the installed app from another app, and where to send it. */
export function SharePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
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
      return { type: 'image', blob: img.blob, name: img.name || share.title || share.text || t('v2.share.sharedImage') };
    }
    const combined = [share.title, share.text, share.url].filter(Boolean).join('\n').trim();
    return combined ? { type: 'text', data: combined } : null;
  };

  const handOff = async (destination: string, attach = false) => {
    if (handingOff) return;
    const payload = buildHandoff();
    if (!payload) {
      toast.success(t('v2.share.nothing'));
      return;
    }
    if (share && share.images.length > 1) toast.success(t(attach ? 'v2.share.firstAttached' : 'v2.share.firstSaved', { count: share.images.length }));
    setHandingOff(true);
    try {
      if (!(await stashPwaShareHandoff(payload))) {
        toast.error(t('v2.share.tooLarge'));
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

  if (status === 'loading') return <LoadingState label={t('v2.share.loading')} minHeight={400} />;

  if (status === 'empty' || !share) {
    const failed = Boolean(swError) || Boolean(share);
    const detail = swError ? t('v2.share.handlerFailed', { message: swError }) : share ? describeDiagnostics(share, t) : t('v2.share.emptyHint');
    return (
      <Page>
        <EmptyState
          icon={failed ? 'warning' : 'image'}
          shape={failed ? 'boom' : 'cookie-9'}
          title={failed ? t('v2.share.failed') : t('v2.share.empty')}
          description={detail}
          action={
            <Button variant="filled" onClick={cancel}>
              {t('v2.share.home')}
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
      <PageHeader title={t('v2.share.title')} description={t('v2.share.description')} backLink={{ label: t('projectViewer.common.cancel'), onClick: cancel }} />
      <div className="flex flex-col gap-5">
        <Section variant="card" icon={<Icon name={hasImage ? 'image' : 'notes'} />} title={t('projectViewer.common.preview')} actions={share.images.length > 1 ? <StatusPill tone="warning">{t('v2.share.showingFirst', { count: share.images.length })}</StatusPill> : undefined}>
          <div className="v2-import-preview">{hasImage ? <img src={share.images[0].objectUrl} alt={t('v2.share.preview')} /> : <pre>{previewText}</pre>}</div>
          {hasImage && previewText && (
            <Text variant="body-small" className="v2-notice">
              {previewText}
            </Text>
          )}
          {share.missingFiles > 0 && (
            <div className="v2-notice" data-tone="warning">
              <Icon name="warning" />
              <Text variant="body-small">
                {t('v2.share.missingFiles', { count: share.missingFiles })}
              </Text>
            </div>
          )}
        </Section>
        <div className="grid gap-3 sm:grid-cols-3">
          <Button variant="tonal" size="md" icon="layers" disabled={handingOff} onClick={() => void handOff('/import?destination=library')}>
            {t('v2.share.saveLibrary')}
          </Button>
          <Button variant="tonal" size="md" icon="folder" disabled={handingOff} onClick={() => void handOff('/import?destination=project')}>
            {t('v2.share.saveProject')}
          </Button>
          <Button variant="filled" size="md" icon="chat" disabled={handingOff} onClick={() => void handOff('/assistant', true)} emphasized>
            {t('v2.share.startChat')}
          </Button>
        </div>
      </div>
    </Page>
  );
}
