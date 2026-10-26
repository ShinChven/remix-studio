import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { fetchReleaseHistory, type ReleaseHistoryItem } from '../../api';
import { Button, Dialog, Icon, IconButton, Text, useSnackbar } from '../../m3';
import { platformMeta } from '../components/exports/releaseMeta';
import { formatDateTime } from '../lib/format';
import { EmptyState, LoadingState, Page, PageHeader } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { StatusPill } from '../ui/Stat';

const PAGE_SIZE = 20;

export function ReleaseHistory() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const [items, setItems] = useState<ReleaseHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedError, setSelectedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchReleaseHistory(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setPages(Math.max(1, res.pages));
      })
      .catch((err) => !cancelled && snackbar.show((err as Error)?.message || t('releases.history.loadError')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, t]);

  return (
    <Page>
      <PageHeader
        title={t('releases.history.title')}
        description={t('releases.history.description')}
        backLink={{ to: '/exports', label: t('releases.backToExports') }}
        actions={
          <StatusPill icon="list">
            {total} {t('releases.history.stats.total')}
          </StatusPill>
        }
      />
      {loading && items.length === 0 ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon="history" shape="cookie-7" title={t('releases.history.empty.title')} description={t('releases.history.empty.description')} />
      ) : (
        <div className="flex flex-col gap-2" data-density="compact">
          {items.map((item) => {
            const ok = item.status === 'success';
            const meta = platformMeta(item.platform);
            const account = item.store?.profileName || item.driveConnection?.displayName || item.driveConnection?.email;
            const url = item.targetUrl || item.product?.gumroadShortUrl || null;
            const title = item.title || item.product?.title || t('releases.history.untitled');
            return (
              <div key={item.id} className="v2-task" data-failed={ok ? undefined : ''}>
                <div className="v2-task__body">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={meta.tone} icon={meta.icon}>
                      {meta.label}
                    </StatusPill>
                    <Text as="span" variant="title-small" emphasized className="truncate">
                      {title}
                    </Text>
                  </div>
                  <div className="v2-task__meta">
                    <span>
                      <Icon name="schedule" size={14} />
                      {formatDateTime(item.createdAt)}
                    </span>
                    {account && (
                      <span>
                        <Icon name={meta.icon} size={14} />
                        {account}
                      </span>
                    )}
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="v2-link inline-flex max-w-[280px] items-center gap-1" title={url}>
                        <Icon name="open_in_new" size={14} />
                        <span className="truncate">{url}</span>
                      </a>
                    )}
                  </div>
                  {!ok && item.error && (
                    <button type="button" className="v2-error-line m3-focus-ring" aria-haspopup="dialog" aria-label={t('releases.history.errorDetails.openAria')} onClick={() => setSelectedError(item.error)}>
                      {item.error}
                    </button>
                  )}
                </div>
                <div className="v2-task__actions">
                  <StatusPill tone={ok ? 'success' : 'error'} icon={ok ? 'check_circle' : 'cancel'}>
                    {ok ? t('releases.history.status.success') : t('releases.history.status.failed')}
                  </StatusPill>
                  {url && <IconButton icon="open_in_new" label={t('releases.history.openTarget')} tooltip size="xs" href={url} target="_blank" rel="noopener noreferrer" />}
                </div>
              </div>
            );
          })}
          {pages > 1 && (
            <div className="v2-page-footer">
              <Pagination
                page={page}
                pages={pages}
                size="sm"
                onPageChange={(next) =>
                  setSearchParams((prev) => {
                    const params = new URLSearchParams(prev);
                    params.set('page', String(next));
                    return params;
                  })
                }
              />
              <Text variant="label-small" className="uppercase tracking-widest">
                {t('exports.pagination', { current: page, total: pages })}
              </Text>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={!!selectedError}
        onClose={() => setSelectedError(null)}
        icon="warning"
        headline={t('releases.history.errorDetails.title')}
        maxWidth={640}
        actions={
          <Button variant="filled" onClick={() => setSelectedError(null)} data-autofocus>
            {t('releases.history.errorDetails.close')}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('releases.history.errorDetails.description')}
          </Text>
          <pre className="v2-error-text">{selectedError}</pre>
        </div>
      </Dialog>
    </Page>
  );
}
