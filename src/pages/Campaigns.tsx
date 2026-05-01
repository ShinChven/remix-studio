import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Clock,
  Layers,
  Loader2,
  Megaphone,
  MoreVertical,
  Plus,
  Search,
  Share2,
  Trash2,
  Twitter,
} from 'lucide-react';
import { toast } from 'sonner';
import { deleteCampaign, fetchCampaigns, fetchSocialAccounts, updateCampaign } from '../api';
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
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

function campaignThumbnail(id: string) {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(id)}&backgroundColor=f1f5f9`;
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

export function Campaigns() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<CampaignCardModel[]>([]);
  const [accountsById, setAccountsById] = useState<Record<string, SocialAccount>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampaignCardModel | null>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    let ignore = false;

    async function load() {
      setIsLoading(true);
      try {
        const [campaignData, accountData] = await Promise.all([
          fetchCampaigns(),
          fetchSocialAccounts().catch(() => []),
        ]);
        if (ignore) return;
        setCampaigns(campaignData.map(mapCampaign));
        setAccountsById(
          Object.fromEntries((accountData as SocialAccount[]).map((account) => [account.id, account])),
        );
      } catch (error) {
        if (!ignore) toast.error('Failed to load campaigns');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load();
    return () => {
      ignore = true;
    };
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
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950 dark:text-white">Campaigns</h1>
            <p className="text-neutral-500 dark:text-neutral-400">Organize your posts into projects and track their progress.</p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center md:w-auto">
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-950 active:translate-y-px dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-white sm:w-auto"
              onClick={() => navigate('/campaigns/channels')}
            >
              <Share2 className="h-4 w-4" />
              Channels
            </button>
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                placeholder="Search campaigns..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-10 pr-3 text-sm font-medium text-neutral-900 outline-none transition focus:border-neutral-900 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/60 sm:w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-bold text-white shadow-lg shadow-black/10 transition hover:bg-neutral-800 active:translate-y-px dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 sm:w-auto"
              onClick={() => navigate('/campaigns/new')}
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 dark:border-white/10 dark:bg-neutral-900">
                <div className="h-52 animate-pulse bg-neutral-200 dark:bg-neutral-800" />
                <div className="space-y-4 p-5">
                  <div className="h-7 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-4 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-12 w-full animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-white/10 dark:bg-neutral-900/70">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-950/10 text-neutral-950 dark:bg-white/10 dark:text-white">
              <Megaphone className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-950 dark:text-white">No campaigns yet</h3>
            <p className="mt-2 mb-8 max-w-sm text-neutral-500 dark:text-neutral-400">
              Create your first campaign to start scheduling and automating your posts across channels.
            </p>
            <button
              onClick={() => navigate('/campaigns/new')}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-bold text-white dark:bg-white dark:text-neutral-950"
            >
              <Plus className="h-4 w-4" />
              Create Campaign
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredCampaigns.map((campaign) => {
              const completedPosts = Math.min(campaign.postedPosts, campaign.totalPosts);
              const progress = campaign.totalPosts > 0 ? Math.round((completedPosts / campaign.totalPosts) * 100) : 0;
              const campaignAccounts = campaign.channels.map((id) => accountsById[id]).filter(Boolean);
              const visibleAccounts = campaignAccounts.slice(0, 3);
              const extraAccountCount = Math.max(campaignAccounts.length - 3, 0);

              return (
                <div
                  key={campaign.id}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 shadow-sm transition-all duration-500 hover:shadow-2xl hover:shadow-black/10 dark:border-white/10 dark:bg-neutral-900"
                  onClick={() => navigate(`/campaigns/${campaign.id}`)}
                >
                  <div className="absolute inset-0 z-0">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${campaign.thumbnail})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-white/75 to-transparent dark:from-neutral-900 dark:via-neutral-900/75" />
                  </div>

                  <div className="absolute right-4 top-4 z-20">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-md',
                        campaign.status === 'Active' ? 'bg-emerald-500/90' : 'bg-amber-500/90',
                      )}
                    >
                      {campaign.status}
                    </span>
                  </div>

                  <div className="relative z-10 flex flex-col">
                    <div className="h-52" />

                    <div className="px-5 pb-3 pt-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <h2 className="truncate text-2xl font-black tracking-tight text-neutral-950 drop-shadow-md dark:text-white">
                            {campaign.name}
                          </h2>
                          <p className="line-clamp-2 text-sm font-medium leading-relaxed text-neutral-700 dark:text-neutral-200">
                            {campaign.description}
                          </p>
                        </div>
                        <div className="relative" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-950/10 dark:hover:bg-white/10"
                            aria-label="Campaign menu"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuId === campaign.id && (
                            <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-neutral-900">
                              <button className="block w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-white/10" onClick={() => navigate(`/campaigns/edit/${campaign.id}`)}>
                                Edit Details
                              </button>
                              <button className="block w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-white/10" onClick={() => void toggleCampaignStatus(campaign)}>
                                {campaign.status === 'Active' ? 'Pause Campaign' : 'Resume Campaign'}
                              </button>
                              <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" onClick={() => setDeleteTarget(campaign)}>
                                <Trash2 className="h-4 w-4" />
                                Delete Campaign
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6 px-5 pb-5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
                        <div className="flex items-center gap-1.5 rounded-full border border-neutral-950/5 bg-neutral-100/70 px-2.5 py-1 shadow-sm dark:bg-white/5">
                          <Calendar className="h-3 w-3" />
                          <span>{campaign.startDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-full border border-neutral-950/5 bg-neutral-100/70 px-2.5 py-1 shadow-sm dark:bg-white/5">
                          <Layers className="h-3 w-3" />
                          <span>{campaign.channels.length} {campaign.channels.length === 1 ? 'Ch' : 'Chs'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-neutral-200/80 bg-white/40 px-3 py-2 backdrop-blur-md transition hover:bg-white/70 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
                        <div className="min-w-0">
                          <p className="text-xs font-black tracking-tight text-neutral-950 dark:text-white">Channels</p>
                          <p className="whitespace-nowrap text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Integrated platforms</p>
                        </div>
                        <div className="flex -space-x-2">
                          {visibleAccounts.map((account) => (
                            <img
                              key={account.id}
                              src={account.avatarUrl || fallbackAvatar(account.id)}
                              alt={channelName(account)}
                              referrerPolicy="no-referrer"
                              className="h-7 w-7 rounded-full border-2 border-white bg-neutral-200 object-cover dark:border-neutral-900"
                            />
                          ))}
                          {extraAccountCount > 0 && (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-neutral-200 text-[10px] font-bold text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-neutral-200">
                              +{extraAccountCount}
                            </div>
                          )}
                          {visibleAccounts.length === 0 && (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-white dark:bg-white dark:text-neutral-950">
                              <Twitter className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black uppercase tracking-tight text-neutral-950 dark:text-white">Progress</span>
                          <span className="rounded-md bg-neutral-950/10 px-2 py-0.5 text-xs font-bold text-neutral-950 dark:bg-white/10 dark:text-white">
                            {completedPosts}/{campaign.totalPosts} posts
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200 shadow-inner dark:bg-neutral-800">
                          <div className="h-full rounded-full bg-neutral-950 transition-all duration-700 dark:bg-white" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-right text-xs font-bold text-neutral-500 dark:text-neutral-400">
                          {campaign.totalPosts > 0 ? `${progress}% completed` : 'Initial Setup'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 border-t border-neutral-950/10 bg-neutral-950/[0.02] px-7 py-4 dark:border-white/10 dark:bg-white/[0.02]">
                      <div className="flex w-full items-center justify-between text-neutral-600 transition-all duration-300 group-hover:text-neutral-950 dark:text-neutral-300 dark:group-hover:text-white">
                        <span className="text-base font-black uppercase tracking-tight">View Campaign</span>
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-2" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
