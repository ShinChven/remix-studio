import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchReleaseHistory } from '../../api';
import { Button, Dialog, Icon, IconButton, Text } from '../../m3';
import { platformMeta } from '../components/exports/releaseMeta';
import { errorText } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { useAsyncData } from '../lib/useAsyncData';
import { PAGE_SIZES, useListParams } from '../lib/useListParams';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { Page, PageHeader } from '../ui/Page';
import { StatusPill } from '../ui/Stat';

export function ReleaseHistory() {
  const { t } = useTranslation();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES });
  const pageSize = list.pageSize === 'all' ? 500 : list.pageSize;
  const history = useAsyncData(() => fetchReleaseHistory(list.page, pageSize), [list.page, pageSize]);
  const items = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const [selectedError, setSelectedError] = useState<string | null>(null);

  return (
    <Page>
      <PageHeader title={t('releases.history.title')} description={t('releases.history.description')} backLink={{ to: '/exports', label: t('releases.backToExports') }} />
      <ListPane
        label={t('releases.history.title')}
        lead={<ListTitle title={t('releases.history.title')} icon="history" count={total} />}
        loading={history.loading}
        refreshing={history.refreshing}
        error={history.error ? errorText(history.error, t('releases.history.loadError')) : null}
        onRetry={() => void history.reload()}
        count={items.length}
        empty={{ icon: 'history', shape: 'cookie-7', title: t('releases.history.empty.title'), description: t('releases.history.empty.description') }}
        paging={{ page: list.page, pageSize: list.pageSize, total, pages: history.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
      >
        <div className="v2-list-pane__grid flex flex-col gap-2" data-density="compact">
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
        </div>
      </ListPane>

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
