import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Facebook,
  Filter,
  Globe,
  History,
  Instagram,
  Linkedin,
  Loader2,
  Megaphone,
  Search,
  Twitter,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchCampaignHistory } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

export function CampaignHistory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '25', 10);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCampaignHistory(page, pageSize);
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
    void loadHistory();
  }, [page, pageSize]);

  const updatePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage.toString());
    setSearchParams(params);
  };

  function getPlatformIcon(platform = '', className = "h-4 w-4") {
    switch (platform.toLowerCase()) {
      case 'twitter':
      case 'x':
        return <Twitter className={className} />;
      case 'instagram':
        return <Instagram className={className} />;
      case 'linkedin':
        return <Linkedin className={className} />;
      case 'facebook':
        return <Facebook className={className} />;
      default:
        return <Globe className={className} />;
    }
  }

  function fallbackAvatar(id: string) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title="Campaign History"
          description="A complete audit log of all your sent and failed posts."
          backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
          actions={
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <History className="h-6 w-6" />
              </div>
            </div>
          }
        />

        <div className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white shadow-sm dark:border-white/5 dark:bg-neutral-900/50">
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
            <div className="flex flex-col items-center justify-center py-20 text-center px-6">
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
                const avatar = account?.avatarUrl || fallbackAvatar(account?.id || post.id);
                
                let externalUrl = execution?.externalUrl;
                if (!externalUrl && execution?.externalId) {
                  const p = platform.toLowerCase();
                  if (p === 'twitter' || p === 'x') {
                    externalUrl = `https://twitter.com/i/web/status/${execution.externalId}`;
                  } else if (p === 'linkedin') {
                    externalUrl = `https://www.linkedin.com/feed/update/${execution.externalId}`;
                  }
                }

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
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white transition-all"
                          title="View live post"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => navigate(`/campaigns/${post.campaign?.id}/posts/edit/${post.id}`)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-600 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white transition-all"
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
            <div className="px-6 py-4 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-white/2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page === 1}
                  onClick={() => updatePage(page - 1)}
                  className="h-7 px-2.5 rounded-lg border border-neutral-200 text-[11px] font-bold text-neutral-600 disabled:opacity-30 dark:border-white/10 dark:text-neutral-400 transition-colors"
                >
                  Prev
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => updatePage(i + 1)}
                      className={cn(
                        "h-7 w-7 rounded-lg text-[11px] font-bold transition-colors",
                        page === i + 1
                          ? "bg-indigo-600 text-white"
                          : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5"
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  disabled={page === totalPages}
                  onClick={() => updatePage(page + 1)}
                  className="h-7 px-2.5 rounded-lg border border-neutral-200 text-[11px] font-bold text-neutral-600 disabled:opacity-30 dark:border-white/10 dark:text-neutral-400 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
