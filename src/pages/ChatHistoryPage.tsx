import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, MessageCircle, Search } from 'lucide-react';
import { searchAssistantConversations, AssistantConversation } from '../api';
import { PageHeader } from '../components/PageHeader';

const PAGE_SIZE = 20;

export function ChatHistoryPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') || '';
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);

  const [items, setItems] = useState<AssistantConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  // Reactive load — re-fetches whenever the q/page search params change.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    searchAssistantConversations(q, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setPages(result.pages);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setItems([]);
        setTotal(0);
        setPages(1);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, page]);

  const submitSearch = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const trimmed = searchInput.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      next.set('page', '1');
      return next;
    });
  };

  const handlePageChange = (nextPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(nextPage));
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-6 pb-20">
        <PageHeader
          title={t('chatHistory.title', { defaultValue: 'Chat History' })}
          description={t('chatHistory.description', {
            defaultValue: 'Search across conversation titles and message content.',
          })}
          backLink={{ to: '/assistant', label: t('chatHistory.backToAssistant', { defaultValue: 'Back to Assistant' }) }}
        />

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
              }}
              placeholder={t('chatHistory.searchPlaceholder', {
                defaultValue: 'Search by title or message content...',
              })}
              className="w-full bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm font-medium text-neutral-900 dark:text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all shadow-sm"
            />
          </div>
          <button
            onClick={submitSearch}
            className="p-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl transition-all flex items-center justify-center border border-indigo-700 shadow-lg shadow-indigo-600/10 active:scale-95"
            title={t('chatHistory.search', { defaultValue: 'Search' })}
            aria-label={t('chatHistory.search', { defaultValue: 'Search' })}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-neutral-500 dark:text-neutral-500">
          {q
            ? t('chatHistory.resultsCount', {
                defaultValue: '{{total}} result(s) for "{{q}}"',
                total,
                q,
              })
            : t('chatHistory.totalCount', { defaultValue: '{{total}} conversation(s)', total })}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-3xl text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4">
            <div className="p-4 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm">
              <MessageCircle className="w-8 h-8 text-neutral-700 dark:text-neutral-400" />
            </div>
            <p className="text-sm">
              {q
                ? t('chatHistory.noResults', { defaultValue: 'No conversations match your search.' })
                : t('chatHistory.empty', { defaultValue: 'No conversations yet.' })}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((conv) => (
              <Link
                key={conv.id}
                to={`/assistant/${conv.id}`}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 hover:bg-white/70 dark:hover:bg-neutral-800/60 transition-all group"
              >
                <MessageCircle className="w-4 h-4 flex-shrink-0 text-neutral-500 group-hover:text-indigo-500 transition-colors" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                    {conv.title || t('chatHistory.untitled', { defaultValue: 'Untitled chat' })}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-500 mt-0.5">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              aria-label={t('chatHistory.previous', { defaultValue: 'Previous page' })}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
              {t('chatHistory.pagination', {
                defaultValue: 'Page {{current}} of {{total}}',
                current: page,
                total: pages,
              })}
            </span>
            <button
              onClick={() => handlePageChange(Math.min(pages, page + 1))}
              disabled={page === pages}
              className="p-3 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl border border-neutral-200/50 dark:border-white/5 rounded-xl text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-sm transition-all active:scale-95"
              aria-label={t('chatHistory.next', { defaultValue: 'Next page' })}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
