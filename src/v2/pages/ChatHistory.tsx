import { uiLocale } from '../lib/format';
import { useTranslation } from 'react-i18next';
import { searchAssistantConversations } from '../../api';
import { Icon } from '../../m3';
import { useAsyncData } from '../lib/useAsyncData';
import { PAGE_SIZES, useListParams } from '../lib/useListParams';
import { ListTitle } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { Page, PageHeader } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';

/** Searches past assistant conversations by title and message content. */
export function ChatHistory() {
  const { t } = useTranslation();
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES });
  const pageSize = list.pageSize === 'all' ? 500 : list.pageSize;
  const chats = useAsyncData(() => searchAssistantConversations(list.q, list.page, pageSize), [list.q, list.page, pageSize]);
  const items = chats.data?.items ?? [];
  const total = chats.data?.total ?? 0;

  return (
    <Page width="default">
      <PageHeader
        title={t('v2.chatHistory.title', { defaultValue: 'Chat History' })}
        description={t('v2.chatHistory.description', { defaultValue: 'Search across conversation titles and message content.' })}
        backLink={{ to: '/assistant', label: t('v2.chatHistory.backToAssistant', { defaultValue: 'Back to Assistant' }) }}
      />
      <ListPane
        label={t('v2.chatHistory.title', { defaultValue: 'Chat History' })}
        lead={<ListTitle title={t('v2.chatHistory.title', { defaultValue: 'Chat History' })} icon="forum" count={total} />}
        tools={<ListSearch value={list.q} onChange={list.setQuery} label={t('v2.chatHistory.searchPlaceholder', { defaultValue: 'Search by title or message content...' })} />}
        loading={chats.loading}
        refreshing={chats.refreshing}
        error={chats.error}
        onRetry={() => void chats.reload()}
        count={items.length}
        filtered={list.filtered}
        onClearFilters={list.clearFilters}
        noMatches={{ title: t('v2.chatHistory.noResults', { defaultValue: 'No conversations match your search.' }) }}
        empty={{ icon: 'forum', shape: 'clover-4', title: t('v2.chatHistory.empty', { defaultValue: 'No conversations yet.' }) }}
        paging={{ page: list.page, pageSize: list.pageSize, total, pages: chats.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize }}
      >
        <RowList className="v2-list-pane__grid">
          {items.map((conv) => (
            <Row key={conv.id} to={`/assistant/${conv.id}`} lead={<Icon name="chat" className="text-primary" />} title={conv.title || t('v2.chatHistory.untitled', { defaultValue: 'Untitled chat' })} meta={<span className="tabular-nums">{new Date(conv.updatedAt).toLocaleString(uiLocale())}</span>} />
          ))}
        </RowList>
      </ListPane>
    </Page>
  );
}
