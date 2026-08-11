import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  History,
  LineChart,
  List,
  Loader2,
  Megaphone,
  Search,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchCampaignHistory, refreshSocialAccountProfile } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';
import { applyAvatarFallback, defaultAvatar } from '../lib/avatar';
import { getPlatformIcon, fallbackExternalUrl } from '../lib/platform';
import { PageNav } from '../components/PageNav';
import { PostingTrendChart, lastNDaysRange } from '../components/PostingTrendChart';

const TREND_RANGE_OPTIONS = [7, 14, 30] as const;

export function CampaignHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);
  const startDateParam = searchParams.get('startDate') || '';
  const endDateParam = searchParams.get('endDate') || '';
  const qParam = searchParams.get('q') || '';

  const [startDate, setStartDate] = useState(startDateParam);
  const [endDate, setEndDate] = useState(endDateParam);
  const [searchQuery, setSearchQuery] = useState(qParam);

  const view = searchParams.get('view') === 'chart' ? 'chart' : 'list';
  const [trendDays, setTrendDays] = useState<number>(30);

  // The chart follows the page's date filter when one is set; otherwise it uses
  // the quick range picker.
  const explicitTrendRange = useMemo(() => {
    if (!startDateParam || !endDateParam) return null;
    const from = new Date(`${startDateParam}T00:00:00`);
    const to = new Date(`${endDateParam}T23:59:59`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
    return { from, to };
  }, [startDateParam, endDateParam]);

  const trendRange = useMemo(
    () => explicitTrendRange ?? lastNDaysRange(trendDays),
    [explicitTrendRange, trendDays],
  );

  const setView = (nextView: 'list' | 'chart') => {
    const params = new URLSearchParams(searchParams);
    if (nextView === 'chart') params.set('view', 'chart');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCampaignHistory(page, pageSize, startDateParam, endDateParam, qParam);
      setHistory(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error: any) {
      console.error('[CampaignHistory] error:', error);
      toast.error(error.message || 'Failed to load campaign history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // The chart pulls its own aggregates, so skip the list request while it is shown.
    if (view === 'list') void loadHistory();
    setStartDate(startDateParam);
    setEndDate(endDateParam);
    setSearchQuery(qParam);
  }, [page, pageSize, startDateParam, endDateParam, qParam, view]);

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.set('page', '1');
    if (startDate) params.set('startDate', startDate);
    else params.delete('startDate');
    
    if (endDate) params.set('endDate', endDate);
    else params.delete('endDate');

    if (searchQuery) params.set('q', searchQuery);
    else params.delete('q');
    
    setSearchParams(params);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('startDate');
    params.delete('endDate');
    params.delete('q');
    params.set('page', '1');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSearchParams(params);
  };

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };


  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full flex flex-col gap-3 md:gap-6 pb-20">
        <PageHeader
          title="History"
          description="Audit log of your posts."
          backLink={{ to: '/campaigns', label: 'Back' }}
          className="mb-0 md:mb-4"
        />

        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-2">
          {/* View switcher */}
          <div className="flex w-full items-center gap-1 rounded-card border border-neutral-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-neutral-900 sm:w-auto">
            <button
              onClick={() => setView('list')}
              className={cn(
                'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-bold transition-colors sm:flex-none',
                view === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/5',
              )}
              aria-pressed={view === 'list'}
            >
              <List className="h-3.5 w-3.5" />
              {t('postingTrend.listView')}
            </button>
            <button
              onClick={() => setView('chart')}
              className={cn(
                'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-xs font-bold transition-colors sm:flex-none',
                view === 'chart'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/5',
              )}
              aria-pressed={view === 'chart'}
            >
              <LineChart className="h-3.5 w-3.5" />
              {t('postingTrend.chartView')}
            </button>
          </div>

          {/* Search bar */}
          <div className={cn('relative w-full sm:w-80', view === 'chart' && 'hidden')}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
              className="w-full h-10 pl-10 pr-3 rounded-card border border-neutral-200 bg-white text-sm text-neutral-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-white/10 dark:bg-neutral-900 dark:text-white transition-all shadow-sm"
            />
          </div>

          {/* Date Range and Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1">
            <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-40 h-10 rounded-card border border-neutral-200 bg-white px-3 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white shadow-sm"
              />
              <span className="text-neutral-400 text-[10px] font-bold">TO</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-40 h-10 rounded-card border border-neutral-200 bg-white px-3 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white shadow-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={applyFilters}
                className="flex h-10 w-10 items-center justify-center rounded-card bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                title="Apply filters"
              >
                <Filter className="h-4 w-4" />
              </button>
              {(startDateParam || endDateParam || qParam) && (
                <button
                  onClick={clearFilters}
                  className="flex h-10 w-10 items-center justify-center rounded-card border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 transition-all shadow-sm"
                  title="Clear filters"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {view === 'chart' ? (
          <div className="flex flex-col gap-3">
            {!explicitTrendRange && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {TREND_RANGE_OPTIONS.map((days) => (
                  <button
                    key={days}
                    onClick={() => setTrendDays(days)}
                    className={cn(
                      'h-8 shrink-0 rounded-full border px-3.5 text-xs font-bold transition-colors',
                      trendDays === days
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                        : 'border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:text-white',
                    )}
                    aria-pressed={trendDays === days}
                  >
                    {t('postingTrend.lastNDays', { days })}
                  </button>
                ))}
              </div>
            )}

            <PostingTrendChart from={trendRange.from} to={trendRange.to} height={280} />
          </div>
        ) : (
        <div className="overflow-hidden rounded-card border border-neutral-200/50 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-900/50">
          {/* Header Row */}
          <div className="hidden lg:grid lg:grid-cols-[240px_1fr_1fr_160px_100px] items-center gap-4 px-6 py-3 bg-neutral-50 dark:bg-white/5 border-b border-neutral-200/50 dark:border-white/5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <span>Social Account</span>
            <span>Campaign</span>
            <span>Status</span>
            <span>Date & Time</span>
            <span className="text-right">Actions</span>
          </div>

          {isLoading ? (
            <div className="divide-y divide-neutral-100 dark:divide-white/5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-6 py-4 animate-pulse flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-3 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="col-span-full py-20 border-2 border-dashed border-neutral-200 dark:border-neutral-800 rounded-card text-center text-neutral-500 dark:text-neutral-500 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-900/20 shadow-sm">
              <div className="h-16 w-16 rounded-full bg-neutral-50 dark:bg-white/5 flex items-center justify-center mb-4">
                <History className="h-8 w-8 text-neutral-300" />
              </div>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white">No history yet</h3>
              <p className="max-w-xs text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Your sending history will appear here once you start publishing posts.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-white/5">
              {history.map((post) => {
                const execution = post.executions?.find((ex: any) => ex.externalUrl) || post.executions?.[0];
                const account = execution?.socialAccount;
                const platform = account?.platform || 'Unknown';
                const name = account?.profileName || 'Unknown Account';
                const avatarSeed = account?.id || post.id;
                const avatar = account?.avatarUrl || defaultAvatar(avatarSeed, name);
                
                const externalUrl = execution?.externalUrl || fallbackExternalUrl(platform, execution?.externalId);

                return (
                  <div key={post.id} className="group hover:bg-neutral-50/30 dark:hover:bg-white/5 transition-colors px-6 py-4 flex flex-col gap-4 lg:grid lg:grid-cols-[240px_1fr_1fr_160px_100px] lg:items-center lg:gap-4">
                    {/* Account */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={avatar}
                          alt={name}
                          className="h-8 w-8 rounded-full border border-neutral-200 object-cover dark:border-white/10"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            if (applyAvatarFallback(e.currentTarget, avatarSeed, name)) {
                              if (account && ['twitter', 'x', 'threads'].includes(platform)) {
                                refreshSocialAccountProfile(platform, account.id).catch(console.error);
                              }
                            }
                          }}
                        />
                        <div className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white bg-white text-neutral-900 shadow-xs dark:border-neutral-900 dark:bg-neutral-800 dark:text-white">
                          {getPlatformIcon(platform, "h-2 w-2")}
                        </div>
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="font-semibold text-sm text-neutral-900 dark:text-white truncate">{name}</span>
                        <span className="text-[10px] text-neutral-500 uppercase font-medium">{platform}</span>
                      </div>
                    </div>

                    {/* Campaign */}
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/campaigns/${post.campaign?.id}`)}
                        className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline truncate text-left w-full transition-colors"
                      >
                        {post.campaign?.name || 'Unknown Campaign'}
                      </button>
                    </div>

                    {/* Status */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          post.status === 'completed' ? "bg-emerald-500" : "bg-red-500"
                        )} />
                        <span className={cn(
                          "text-xs font-semibold",
                          post.status === 'completed' ? "text-emerald-600" : "text-red-600"
                        )}>
                          {post.status === 'completed' ? 'Published' : 'Failed'}
                        </span>
                      </div>
                      {post.status === 'failed' && execution?.errorMsg && (
                        <p className="text-[10px] text-neutral-400 truncate italic" title={execution.errorMsg}>
                          {execution.errorMsg}
                        </p>
                      )}
                    </div>

                    {/* Time */}
                    <div className="flex flex-col text-xs text-neutral-500">
                      <span className="font-medium">{new Date(post.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="opacity-70">{new Date(post.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-end gap-1">
                      {externalUrl && (
                        <a
                          href={externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-8 w-8 items-center justify-center rounded-card border border-neutral-200 text-neutral-400 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white transition-all"
                          title="View live post"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/campaigns/${post.campaign?.id}/posts/edit/${post.id}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-card border border-neutral-200 text-neutral-400 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white transition-all"
                        title="Manage"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="px-4 sm:px-6 py-4 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-white/2 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] font-medium text-neutral-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
              </span>
              <PageNav page={page} pages={totalPages} onPageChange={updatePage} />
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
