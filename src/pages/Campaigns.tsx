import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Calendar,
  Clock,
  ExternalLink,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Megaphone,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Share2,
  Trash2,
  Twitter,
} from 'lucide-react';
import { toast } from 'sonner';
import { deleteCampaign, fetchCampaigns, fetchRecentPosts, fetchScheduledPosts, fetchSocialAccounts, updateCampaign } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

type CampaignStatus = 'Active' | 'Inactive';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

interface CampaignCardModel {
  id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  startDate: string;
  channels: string[];
  totalPosts: number;
  postedPosts: number;
  thumbnail: string;
}

function toCampaignStatus(status?: string): CampaignStatus {
  return status === 'active' ? 'Active' : 'Inactive';
}

function channelName(account?: SocialAccount) {
  return account?.profileName || account?.platform || 'Channel';
}

function fallbackAvatar(id: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(id)}&backgroundColor=6366f1,4f46e5,4338ca`;
}

function campaignThumbnail(id: string) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(id)}&backgroundColor=0f172a,1e293b,334155&shape1Color=6366f1,818cf8,4f46e5`;
}

function mapCampaign(raw: any): CampaignCardModel {
  const posts = Array.isArray(raw.posts) ? raw.posts : [];
  const totalPosts = raw._count?.posts ?? posts.length ?? 0;
  const postedPosts = posts.filter((post: any) => post.status === 'completed' || post.status === 'posted').length;

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || `Campaign created on ${new Date(raw.createdAt).toLocaleDateString()}`,
    status: toCampaignStatus(raw.status),
    startDate: raw.createdAt ? new Date(raw.createdAt).toLocaleDateString() : '-',
    channels: (raw.socialAccounts || []).map((account: SocialAccount) => account.id),
    totalPosts,
    postedPosts,
    thumbnail: campaignThumbnail(raw.id),
  };
}

function getPlatformIcon(platform = '', className = "h-3.5 w-3.5") {
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

export function Campaigns() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<CampaignCardModel[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignCardModel | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [recentPostsLoading, setRecentPostsLoading] = useState(true);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [scheduledPostsLoading, setScheduledPostsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const campaignData = await fetchCampaigns();
      setCampaigns(campaignData.map(mapCampaign));
    } catch (error) {
      toast.error('Failed to load campaigns');
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecentPosts = async () => {
    setRecentPostsLoading(true);
    try {
      const data = await fetchRecentPosts(20);
      setRecentPosts(data);
    } catch (error) {
      console.error('Failed to load recent posts', error);
    } finally {
      setRecentPostsLoading(false);
    }
  };

  const loadScheduledPosts = async () => {
    setScheduledPostsLoading(true);
    try {
      const data = await fetchScheduledPosts(1, 5);
      setScheduledPosts(data.items);
    } catch (error) {
      console.error('Failed to load scheduled posts', error);
    } finally {
      setScheduledPostsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    void loadRecentPosts();
    void loadScheduledPosts();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      else params.delete('q');
      setSearchParams(params, { replace: true });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchQuery, searchParams, setSearchParams]);

  const filteredCampaigns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((campaign) =>
      `${campaign.name} ${campaign.description}`.toLowerCase().includes(q),
    );
  }, [campaigns, searchQuery]);

  const toggleCampaignStatus = async (campaign: CampaignCardModel) => {
    const nextStatus = campaign.status === 'Active' ? 'archived' : 'active';
    try {
      await updateCampaign(campaign.id, { status: nextStatus } as any);
      setCampaigns((prev) =>
        prev.map((item) =>
          item.id === campaign.id
            ? { ...item, status: nextStatus === 'active' ? 'Active' : 'Inactive' }
            : item,
        ),
      );
      toast.success(nextStatus === 'active' ? 'Campaign resumed' : 'Campaign paused');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update campaign');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCampaign(deleteTarget.id);
      setCampaigns((prev) => prev.filter((campaign) => campaign.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Campaign deleted');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete campaign');
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title="Campaigns"
          description="Organize your posts into projects and track their progress."
          actions={(
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 hover:text-neutral-950 active:scale-95 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-800/60 dark:hover:text-white sm:w-auto"
              onClick={() => navigate('/campaigns/channels')}
            >
              <Share2 className="h-4 w-4" />
              Channels
            </button>
          )}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: Campaign Grid */}
          <section className="lg:col-span-2 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:h-10 sm:items-center sm:justify-between">
              <h3 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-white">
                <Megaphone className="h-5 w-5 text-indigo-500" />
                All Campaigns {filteredCampaigns.length > 0 && <span className="text-sm font-normal text-neutral-500 dark:text-neutral-500">({filteredCampaigns.length})</span>}
              </h3>

              <div className="flex items-center gap-3">
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-500 dark:text-neutral-500" />
                  <input
                    placeholder="Search campaigns..."
                    className="h-10 w-full rounded-xl border border-neutral-200/50 bg-white/40 py-2 pl-10 pr-4 text-sm font-medium text-neutral-900 shadow-sm outline-none backdrop-blur-3xl transition-all placeholder:text-neutral-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 sm:w-64"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-700 bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95"
                  onClick={() => navigate('/campaigns/new')}
                  title="New Campaign"
                  aria-label="New Campaign"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="grid gap-6 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 dark:border-white/10 dark:bg-neutral-900">
                    <div className="h-52 animate-pulse bg-neutral-200 dark:bg-neutral-800" />
                    <div className="space-y-3 px-6 pt-3 pb-3">
                      <div className="h-7 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                      <div className="h-4 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                      <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    </div>
                    <div className="space-y-6 px-6 pb-6">
                      <div className="flex gap-1.5">
                        <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
                        <div className="h-6 w-16 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                      <div className="h-12 w-full animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <div className="h-4 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                          <div className="h-4 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                        </div>
                        <div className="h-2.5 w-full animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-800" />
                      </div>
                    </div>
                    <div className="border-t border-neutral-100 px-6 py-4 dark:border-white/5">
                      <div className="h-5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-[2.5rem] border-2 border-dashed border-neutral-200 bg-white/40 p-12 text-center text-neutral-500 shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40">
                <Megaphone className="h-8 w-8 opacity-20" />
                <h3 className="text-xl font-bold text-neutral-950 dark:text-white">No campaigns found</h3>
                <button onClick={() => navigate('/campaigns/new')} className="text-indigo-600 font-bold hover:underline">Create one now</button>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                {filteredCampaigns.map((campaign) => {
                  const completedPosts = Math.min(campaign.postedPosts, campaign.totalPosts);
                  const progress = campaign.totalPosts > 0 ? Math.round((completedPosts / campaign.totalPosts) * 100) : 0;


                  return (
                    <div
                      key={campaign.id}
                      className="group relative flex flex-col justify-end cursor-pointer overflow-hidden rounded-[20px] h-72 shadow-sm transition-all duration-500 hover:shadow-2xl hover:-translate-y-1"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    >
                      {/* Background Image Layer with Gradient Mask */}
                      <div className="absolute inset-0 z-0 bg-neutral-900">
                        <div
                          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                          style={{ backgroundImage: `url(${campaign.thumbnail})` }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                      </div>

                      <div className="relative z-10 flex flex-col p-5 w-full">
                        {/* Status Label */}
                        <div className="text-[12px] font-bold tracking-widest text-white/80 mb-1 uppercase">
                          {campaign.status === 'Active' ? 'Active Campaign' : 'Paused'}
                        </div>
                        
                        {/* Title */}
                        <h2 className="text-2xl font-medium tracking-tight text-white mb-2 line-clamp-1">
                          {campaign.name}
                        </h2>
                        
                        {/* Description */}
                        <p className="text-[15px] font-medium leading-relaxed text-white/70 line-clamp-2 mb-4">
                          {campaign.description}
                        </p>
                        
                        {/* Bottom Row */}
                        <div className="flex items-center justify-between text-white/90">
                          <div className="flex items-center gap-2 font-medium text-[15px]">
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                            <span>{campaign.totalPosts > 0 ? `${completedPosts}/${campaign.totalPosts} posts` : 'Setup'}</span>
                          </div>

                          <div className="relative" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition hover:bg-white/20 hover:text-white"
                            >
                              <MoreHorizontal className="h-5 w-5" />
                            </button>
                            {openMenuId === campaign.id && (
                              <div className="absolute bottom-full right-0 mb-2 z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 py-1 text-sm shadow-2xl backdrop-blur-xl">
                                <button className="block w-full px-4 py-2 text-left text-white/80 hover:bg-white/10" onClick={() => navigate(`/campaigns/edit/${campaign.id}`)}>
                                  Edit Details
                                </button>
                                <button className="block w-full px-4 py-2 text-left text-white/80 hover:bg-white/10" onClick={() => void toggleCampaignStatus(campaign)}>
                                  {campaign.status === 'Active' ? 'Pause Campaign' : 'Resume Campaign'}
                                </button>
                                <button className="block w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/10" onClick={() => setDeleteTarget(campaign)}>
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Column: Recently Posted & Scheduled */}
          <aside className="lg:col-span-1 space-y-8">
            <div className="space-y-6">
              <div className="flex h-10 items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-white">
                  <Activity className="h-5 w-5 text-indigo-500" />
                  Recently Posted
                </h3>
              </div>

              <div className="rounded-3xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
                <div className="space-y-6">
                  {recentPostsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 animate-pulse">
                        <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-800" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded" />
                          <div className="h-3 w-1/3 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
                        </div>
                      </div>
                    ))
                  ) : recentPosts.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-sm text-neutral-500">No recent activity found.</p>
                    </div>
                  ) : (
                    recentPosts.map((post) => {
                      // Find the first execution that has an external URL, or fallback to the first execution
                      const executionWithLink = post.executions?.find((ex: any) => ex.externalUrl);
                      const primaryExecution = executionWithLink || post.executions?.[0];
                      const account = primaryExecution?.socialAccount;
                      const platform = account?.platform || 'Unknown';
                      const name = account?.profileName || 'Unknown Account';
                      const avatar = account?.avatarUrl || fallbackAvatar(account?.id || post.id);

                      let externalUrl = primaryExecution?.externalUrl;
                      if (!externalUrl && primaryExecution?.externalId) {
                        const p = platform.toLowerCase();
                        if (p === 'twitter' || p === 'x') {
                          externalUrl = `https://twitter.com/i/web/status/${primaryExecution.externalId}`;
                        } else if (p === 'linkedin') {
                          externalUrl = `https://www.linkedin.com/feed/update/${primaryExecution.externalId}`;
                        }
                      }

                      return (
                        <div key={post.id} className="group flex items-start gap-4">
                          <div className="relative shrink-0">
                            <Link to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`} className={cn("relative", "block")}>
                              <img
                                src={avatar}
                                alt={name}
                                className="h-10 w-10 rounded-full border border-neutral-200 object-cover transition group-hover:border-indigo-500/50 dark:border-white/10"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-white text-neutral-900 shadow-sm dark:border-neutral-900 dark:bg-neutral-800 dark:text-white">
                                {getPlatformIcon(platform, "h-2 w-2")}
                              </div>
                            </Link>
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`}
                                className={cn(
                                  "truncate text-sm font-bold text-neutral-900 dark:text-white",
                                  "hover:text-indigo-600 dark:hover:text-indigo-400"
                                )}
                              >
                                {name}
                              </Link>
                              <span className={cn(
                                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                                post.status === 'completed'
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-red-500/10 text-red-600 dark:text-red-400"
                              )}>
                                {post.status === 'completed' ? 'Published' : 'Failed'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
                              <Link
                                className="cursor-pointer truncate hover:text-indigo-600 hover:underline"
                                to={`/campaigns/${post.campaignId || post.campaign?.id}`}
                              >
                                {post.campaign?.name}
                              </Link>
                              <span className="shrink-0">•</span>
                              <span className="shrink-0 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {new Date(post.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          {externalUrl && (
                            <a
                              href={externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition hover:border-indigo-500/50 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
                              title="View live post"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {recentPosts.length > 0 && (
                  <button
                    className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300/70 bg-neutral-200/60 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-900 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15 dark:hover:text-white"
                    onClick={() => navigate('/campaigns/history')}
                  >
                    View All History
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex h-10 items-center justify-between">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-white">
                  <Calendar className="h-5 w-5 text-indigo-500" />
                  Scheduled Posts
                </h3>
              </div>

              <div className="rounded-3xl border border-neutral-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
                <div className="space-y-6">
                  {scheduledPostsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 animate-pulse">
                        <div className="h-10 w-10 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/2 bg-neutral-200 dark:bg-neutral-800 rounded" />
                          <div className="h-3 w-1/3 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
                        </div>
                      </div>
                    ))
                  ) : scheduledPosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4">
                        <Clock className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Upcoming Queue</h4>
                      <p className="text-xs text-neutral-500 mt-1 mb-6 max-w-[200px]">
                        No scheduled posts found. Start planning your campaigns!
                      </p>
                    </div>
                  ) : (
                    scheduledPosts.map((post) => (
                      <div key={post.id} className="group flex items-start gap-4">
                        <Link 
                          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800"
                          to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`}
                        >
                          {post.media?.[0]?.thumbnailUrl ? (
                            <img src={post.media[0].thumbnailUrl} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Calendar className="h-5 w-5 text-neutral-400" />
                            </div>
                          )}
                        </Link>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Link 
                            className="truncate text-sm font-bold text-neutral-900 hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400 transition-colors"
                            to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`}
                          >
                            {post.textContent || <span className="italic font-normal text-neutral-400">No text content</span>}
                          </Link>
                          <div className="flex items-center gap-2 text-[11px] font-medium text-neutral-500">
                            <span className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                              <Clock className="h-3 w-3" />
                              {new Date(post.scheduledAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                            <span className="shrink-0">•</span>
                            <span className="truncate">{post.campaign?.name}</span>
                          </div>
                        </div>
                        <Link
                          to={`/campaigns/${post.campaignId || post.campaign?.id}/posts/edit/${post.id}`}
                          className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition hover:border-indigo-500/50 hover:bg-indigo-50/50 hover:text-indigo-600 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))
                  )}
                </div>

                <button
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300/70 bg-neutral-200/60 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200 hover:text-neutral-900 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:bg-white/15 dark:hover:text-white"
                  onClick={() => navigate('/campaigns/scheduled')}
                >
                  {scheduledPosts.length > 0 ? 'View All Scheduled' : 'Open Calendar'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-neutral-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Delete Campaign</h2>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone and will delete all associated posts.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700" onClick={() => void confirmDelete()}>
                Delete Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
