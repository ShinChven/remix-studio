import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchAutoTagSettings, fetchProviders } from '../../api';
import { Button, Checkbox, Dialog, Icon, LoadingIndicator, Text } from '../../m3';
import type { AutoTagSettings } from '../../types';

export interface AutoTagDialogProps {
  open: boolean;
  onClose: () => void;
  /** How many items the run covers before untagged-only filtering. */
  itemCount: number;
  /** Starts the run; rejects to keep the dialog open. */
  onStart: (options: { onlyUntagged: boolean }) => Promise<void>;
}

/** Confirms an auto-tagging run: the tagging model, the item count, and whether tagged items are skipped. */
export function AutoTagDialog({ open, onClose, itemCount, onStart }: AutoTagDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AutoTagSettings | null>(null);
  const [modelLabel, setModelLabel] = useState('');
  const [loadError, setLoadError] = useState('');
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const [next, providers] = await Promise.all([fetchAutoTagSettings(), fetchProviders()]);
        if (cancelled) return;
        const provider = providers.find((item) => item.id === next.providerId);
        const model = provider?.models.find((item) => item.id === next.modelConfigId);
        setSettings(next);
        setModelLabel(provider && model ? `${model.name} · ${provider.name}` : '');
      } catch (error) {
        if (!cancelled) setLoadError((error as Error)?.message || t('autoTag.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const isOff = !loading && !loadError && !modelLabel;
  const canStart = !loading && !loadError && !isOff && !starting && itemCount > 0;

  const start = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      await onStart({ onlyUntagged });
      onClose();
    } catch {
      // The caller reports the error; the dialog stays open to try again.
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !starting && onClose()}
      dismissible={!starting}
      icon="wand_stars"
      headline={t('autoTag.dialogTitle', { count: itemCount })}
      maxWidth={480}
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={starting}>
            {t('confirmModal.cancel')}
          </Button>
          <Button variant="filled" loading={starting} disabled={!canStart} onClick={() => void start()}>
            {t('autoTag.start')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center gap-3 text-on-surface-variant">
          <LoadingIndicator size={32} />
          <Text variant="body-medium">{t('autoTag.loading')}</Text>
        </div>
      ) : loadError ? (
        <Text variant="body-medium" className="text-error">
          {loadError}
        </Text>
      ) : isOff ? (
        <div className="v2-notice" data-tone="warning">
          <Icon name="warning" />
          <div className="flex flex-col gap-2">
            <Text variant="body-medium">{t('autoTag.off')}</Text>
            <Link to="/account?tab=preferences" className="v2-link self-start">
              {t('autoTag.openPreferences')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('autoTag.dialogMessage', { limit: settings?.concurrencyLimit ?? 1 })}
          </Text>
          <div className="v2-kv">
            <Text as="span" variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
              {t('autoTag.model')}
            </Text>
            <Text as="span" variant="title-small" emphasized className="break-words">
              {modelLabel}
            </Text>
          </div>
          <Checkbox label={t('autoTag.onlyUntagged')} checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} />
        </div>
      )}
    </Dialog>
  );
}
