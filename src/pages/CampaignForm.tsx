import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Check,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Search,
  Twitter,
} from 'lucide-react';
import { toast } from 'sonner';
import { createCampaign, fetchCampaign, fetchSocialAccounts, updateCampaign } from '../api';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/utils';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
  status?: string;
  createdAt?: string;
}

function getPlatformIcon(platform: string) {
  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return <Twitter className="h-4 w-4" />;
    case 'instagram':
      return <Instagram className="h-4 w-4" />;
    case 'linkedin':
      return <Linkedin className="h-4 w-4" />;
    case 'facebook':
      return <Facebook className="h-4 w-4" />;
    default:
      return <Globe className="h-4 w-4" />;
  }
}

function fallbackAvatar(id: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

function displayName(account: SocialAccount) {
  return account.profileName || account.accountId || account.platform;
}

export function CampaignForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const accountData = await fetchSocialAccounts();
      setAccounts(accountData);

      if (isEditing && id) {
        const campaign = await fetchCampaign(id);
        setName(campaign.name || '');
        setDescription(campaign.description || '');
        setSelectedAccountIds((campaign.socialAccounts || []).map((account: SocialAccount) => account.id));
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error loading campaign data');
      if (isEditing) navigate('/campaigns');
    } finally {
      setIsLoading(false);
    }
  }, [id, isEditing, navigate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    return accounts.filter((account) => {
      if (account.status && account.status !== 'active') return false;
      const matchesSearch = !q || `${displayName(account)} ${account.platform}`.toLowerCase().includes(q);
      const matchesPlatform = platformFilter ? account.platform.toLowerCase() === platformFilter.toLowerCase() : true;
      return matchesSearch && matchesPlatform;
    });
  }, [accounts, accountSearch, platformFilter]);

  const selectedAccountIdSet = useMemo(() => new Set(selectedAccountIds.map((value) => value.toLowerCase())), [selectedAccountIds]);

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const key = accountId.toLowerCase();
      if (prev.some((id) => id.toLowerCase() === key)) {
        return prev.filter((id) => id.toLowerCase() !== key);
      }
      return [...prev, accountId];
    });
  };

  const selectAllFiltered = () => {
    setSelectedAccountIds((prev) => {
      const seen = new Set(prev.map((value) => value.toLowerCase()));
      const next = [...prev];
      for (const account of filteredAccounts) {
        if (seen.has(account.id.toLowerCase())) continue;
        seen.add(account.id.toLowerCase());
        next.push(account.id);
      }
      return next;
    });
  };

  const deselectAllFiltered = () => {
    const filteredIds = new Set(filteredAccounts.map((account) => account.id.toLowerCase()));
    setSelectedAccountIds((prev) => prev.filter((accountId) => !filteredIds.has(accountId.toLowerCase())));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && id) {
        await updateCampaign(id, {
          name: name.trim(),
          description: description.trim(),
          socialAccountIds: selectedAccountIds,
        });
        toast.success('Campaign updated successfully');
        navigate(`/campaigns/${id}`);
      } else {
        const campaign = await createCampaign({
          name: name.trim(),
          description: description.trim(),
          socialAccountIds: selectedAccountIds,
        });
        toast.success('Campaign created successfully');
        navigate(`/campaigns/${campaign.id}`);
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save campaign');
    } finally {
      setIsSaving(false);
    }
  };

  const uniquePlatforms = Array.from(new Set(accounts.map((account) => account.platform))).filter(Boolean);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-12 w-12 animate-spin text-neutral-950 dark:text-white" />
        <p className="font-medium text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title={isEditing ? 'Edit Campaign' : 'Create New Campaign'}
          description={isEditing ? 'Update your campaign settings and target channels.' : 'Set up a new campaign and select which channels will participate.'}
          backLink={{ label: 'Back', onClick: () => navigate(-1) }}
        />

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-1">
            <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-neutral-950 dark:text-white">Basic Information</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">General details about your campaign.</p>
              </div>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <label htmlFor="campaign-name" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Campaign Name</label>
                  <input
                    id="campaign-name"
                    placeholder="e.g. Q4 Growth Sprint"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-10 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-medium text-neutral-950 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="campaign-description" className="text-sm font-medium text-neutral-800 dark:text-neutral-200">Description</label>
                  <textarea
                    id="campaign-description"
                    placeholder="What is the goal of this campaign?"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-[120px] resize-none rounded-xl border border-neutral-200/50 bg-white/40 px-3 py-2 text-sm font-medium text-neutral-950 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200/50 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Selection Summary</h2>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{selectedAccountIds.length}</span>
                <span className="mb-1 text-neutral-500 dark:text-neutral-400">Channels Selected</span>
              </div>
              <div className="mt-6 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Total Available</span>
                  <span className="font-medium text-neutral-950 dark:text-white">{accounts.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Coverage</span>
                  <span className="font-medium text-neutral-950 dark:text-white">{Math.round((selectedAccountIds.length / accounts.length) * 100) || 0}%</span>
                </div>
              </div>
              <div className="mt-5 border-t border-neutral-200/50 pt-4 dark:border-white/5">
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center rounded-xl border border-indigo-700 bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 disabled:opacity-60"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEditing ? 'Save Changes' : 'Launch Campaign'}
                </button>
              </div>
            </section>
          </div>

          <section className="flex min-h-[620px] flex-col rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70 lg:col-span-2">
            <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-5 dark:border-white/5 dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-neutral-950 dark:text-white">Channel Selection</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Select which accounts will be used for this campaign.</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" className="h-8 rounded-lg border border-neutral-200/50 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-white/5 dark:text-neutral-200 dark:hover:bg-white/10" onClick={selectAllFiltered}>Select All</button>
                  <button type="button" className="h-8 rounded-lg border border-neutral-200/50 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-white/5 dark:text-neutral-200 dark:hover:bg-white/10" onClick={deselectAllFiltered}>Deselect All</button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    placeholder="Search by username or platform..."
                    className="h-10 w-full rounded-xl border border-neutral-200/50 bg-white/40 pl-10 pr-3 text-sm font-medium text-neutral-950 shadow-sm outline-none backdrop-blur-3xl transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/5 dark:bg-neutral-950/40 dark:text-white"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {uniquePlatforms.map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      className={cn(
                        'flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition',
                        platformFilter === platform
                          ? 'border-indigo-700 bg-indigo-600 text-white shadow-sm shadow-indigo-600/10'
                          : 'border-neutral-200/50 bg-white/40 text-neutral-700 hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/40 dark:text-neutral-200 dark:hover:bg-white/10',
                      )}
                      onClick={() => setPlatformFilter(platformFilter === platform ? null : platform)}
                    >
                      {getPlatformIcon(platform)}
                      <span>{platform === 'twitter' ? 'X' : platform}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredAccounts.map((account) => {
                  const selected = selectedAccountIdSet.has(account.id.toLowerCase());
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className={cn(
                        'flex items-center justify-between rounded-xl border p-3 text-left transition-all duration-200',
                        selected
                          ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30 shadow-sm'
                          : 'border-neutral-200/50 bg-white/40 hover:border-indigo-500/30 hover:bg-white/70 dark:border-white/5 dark:bg-neutral-950/30 dark:hover:bg-white/10',
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800">
                          <img src={account.avatarUrl || fallbackAvatar(account.id)} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-neutral-950 dark:text-white">{displayName(account)}</p>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {getPlatformIcon(account.platform)}
                            <span>{account.platform}</span>
                          </div>
                        </div>
                      </div>
                      {selected ? (
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      ) : (
                        <div className="h-6 w-6 shrink-0 rounded-full border border-neutral-200 dark:border-white/10" />
                      )}
                    </button>
                  );
                })}
                {filteredAccounts.length === 0 && (
                  <div className="col-span-full py-20 text-center">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      <Search className="h-6 w-6" />
                    </div>
                    <p className="font-medium text-neutral-500 dark:text-neutral-400">No accounts found matching your search.</p>
                    <button type="button" className="mt-2 text-sm font-bold text-neutral-950 underline dark:text-white" onClick={() => { setAccountSearch(''); setPlatformFilter(null); }}>
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
