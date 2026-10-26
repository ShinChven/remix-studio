import { useTranslation } from 'react-i18next';
import type { ReleaseHistoryItem } from '../../../api';
import { Button, Dialog, Icon, Text } from '../../../m3';
import { formatDateTime } from '../../lib/format';
import { EmptyState, ErrorState, LoadingState } from '../../ui/Page';
import { StatusPill } from '../../ui/Stat';
import { platformMeta } from './releaseMeta';

interface Props {
  exportName: string;
  /** Cached rows, or null while they have never been loaded for this export. */
  items: ReleaseHistoryItem[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}

/** Store and drive upload history of one export, loaded when the dialog opens. */
export function ExportReleaseHistoryDialog({ exportName, items, loading, error, onClose, onRetry }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog
      open
      onClose={onClose}
      icon="history"
      headline={t('releases.history.exportDialog.title')}
      maxWidth={640}
      fullScreen="compact"
      actions={
        <div className="flex w-full items-center justify-between gap-3">
          <Text variant="label-medium" className="text-on-surface-variant">
            {items ? t('releases.history.exportDialog.count', { count: items.length }) : ''}
          </Text>
          <Button variant="filled" onClick={onClose} data-autofocus>
            {t('releases.history.errorDetails.close')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Text variant="label-large" className="truncate text-on-surface-variant" title={exportName}>
          {exportName}
        </Text>
        {loading && items === null ? (
          <LoadingState minHeight={160} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} retryLabel={t('releases.history.exportDialog.retry')} />
        ) : !items || items.length === 0 ? (
          <EmptyState size="inline" icon="history" title={t('releases.history.exportDialog.empty.title')} description={t('releases.history.exportDialog.empty.description')} />
        ) : (
          items.map((item) => {
            const ok = item.status === 'success';
            const meta = platformMeta(item.platform);
            const account = item.store?.profileName || item.driveConnection?.displayName || item.driveConnection?.email;
            const url = item.targetUrl || item.product?.gumroadShortUrl || null;
            return (
              <div key={item.id} className="v2-history-item" data-failed={ok ? undefined : ''}>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={meta.tone} icon={meta.icon}>
                      {meta.label}
                    </StatusPill>
                    {account && (
                      <Text as="span" variant="label-medium" className="truncate">
                        {account}
                      </Text>
                    )}
                  </div>
                  <Text as="span" variant="body-small" className="inline-flex items-center gap-1 text-on-surface-variant">
                    <Icon name="schedule" size={14} />
                    {formatDateTime(item.createdAt)}
                  </Text>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="v2-link inline-flex min-w-0 items-center gap-1" title={url}>
                      <Icon name="open_in_new" size={14} />
                      <span className="truncate">{url}</span>
                    </a>
                  )}
                  {!ok && item.error && <pre className="v2-error-text">{item.error}</pre>}
                </div>
                <StatusPill tone={ok ? 'success' : 'error'} icon={ok ? 'check_circle' : 'cancel'}>
                  {ok ? t('releases.history.status.success') : t('releases.history.status.failed')}
                </StatusPill>
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}
