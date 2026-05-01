import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Layers,
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
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title="Campaigns"
          description="Organize your posts into projects and track their progress."
          actions={(
            <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:w-auto">
              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-4 text-sm font-bold text-neutral-700 shadow-sm backdrop-blur-3xl transition hover:bg-white/60 hover:text-neutral-950 active:scale-95 dark:border-white/5 dark:bg-neutral-900/40 dark:text-neutral-200 dark:hover:bg-neutral-800/60 dark:hover:text-white sm:w-auto"
                onClick={() => navigate('/campaigns/channels')}
              >
                <Share2 className="h-4 w-4" />
                Channels
              </button>
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
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95 sm:w-auto"
                onClick={() => navigate('/campaigns/new')}
              >
                <Plus className="h-4 w-4" />
                New Campaign
              </button>
            </div>
          )}
        />

        <section>
          <div className="mb-6 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xl font-semibold text-neutral-900 dark:text-white">
              <Megaphone className="h-5 w-5 text-indigo-500" />
              All Campaigns {filteredCampaigns.length > 0 && <span className="text-sm font-normal text-neutral-500 dark:text-neutral-500">({filteredCampaigns.length})</span>}
            </h3>
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
          <div className="col-span-full flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-[2.5rem] border-2 border-dashed border-neutral-200 bg-white/40 p-12 text-center text-neutral-500 shadow-sm backdrop-blur-3xl dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              <Megaphone className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-950 dark:text-white">No campaigns yet</h3>
            <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
              Create your first campaign to start scheduling and automating your posts across channels.
            </p>
            <button
              onClick={() => navigate('/campaigns/new')}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95"
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
                  className="group relative flex min-h-[260px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-neutral-200/50 bg-white/70 p-5 text-left shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-indigo-500/50 hover:bg-white/80 hover:shadow-xl dark:border-white/5 dark:bg-neutral-900/70 dark:hover:bg-neutral-800/80"
                  onClick={() => navigate(`/campaigns/${campaign.id}`)}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-indigo-500/10 text-indigo-500 shadow-lg shadow-indigo-500/5 transition-transform group-hover:scale-110">
                      <img src={campaign.thumbnail} alt="" className="h-full w-full object-cover opacity-80" />
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest',
                        campaign.status === 'Active'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {campaign.status}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col">
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <h2 className="truncate text-lg font-semibold text-neutral-900 dark:text-white">
                            {campaign.name}
                          </h2>
                          <p className="line-clamp-2 min-h-10 text-sm leading-5 text-neutral-600 dark:text-neutral-400">
                            {campaign.description}
                          </p>
                        </div>
                        <div className="relative" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === campaign.id ? null : campaign.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
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
                    <div className="mt-auto space-y-4">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-neutral-500 dark:text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          <span className="font-bold">{campaign.startDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3 w-3" />
                          <span className="font-bold">{campaign.channels.length} {campaign.channels.length === 1 ? 'channel' : 'channels'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-neutral-200/50 bg-neutral-100/40 px-3 py-2 dark:border-white/5 dark:bg-white/5">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 dark:text-white">Channels</p>
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
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500">
                              <Twitter className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-neutral-900 dark:text-white">Progress</span>
                          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                            {completedPosts}/{campaign.totalPosts} posts
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-neutral-200 shadow-inner dark:bg-neutral-800">
                          <div className="h-full rounded-full bg-indigo-600 transition-all duration-700" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-right text-xs font-bold text-neutral-500 dark:text-neutral-400">
                          {campaign.totalPosts > 0 ? `${progress}% completed` : 'Initial Setup'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-neutral-200/50 pt-4 dark:border-white/5">
                      <div className="flex w-full items-center justify-between text-sm font-bold text-neutral-500 transition-all duration-300 group-hover:text-indigo-600 dark:text-neutral-400 dark:group-hover:text-indigo-400">
                        <span>View Campaign</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </section>
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
