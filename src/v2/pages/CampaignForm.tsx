import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createCampaign, fetchCampaign, fetchSocialAccounts, updateCampaign } from '../../api';
import { Button, Icon, Ripple, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PlatformIcon, platformLabel } from '../lib/platform';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { SearchField } from '../ui/SearchField';
import { StatTile } from '../ui/Stat';
import { useToast } from '../ui/useToast';

interface SocialAccount {
  id: string;
  platform: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  accountId?: string;
  status?: string;
}

const displayName = (account: SocialAccount) => account.profileName || account.accountId || account.platform;

/** Creates or edits a campaign: its name, description and the channels it posts to. */
export function CampaignForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isEditing = Boolean(id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await fetchSocialAccounts());
      if (isEditing && id) {
        const campaign = await fetchCampaign(id);
        setName(campaign.name || '');
        setDescription(campaign.description || '');
        setSelected((campaign.socialAccounts || []).map((a: SocialAccount) => a.id));
      }
    } catch (error) {
      toast.error((error as Error)?.message || 'Error loading campaign data');
      if (isEditing) navigate('/campaigns');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEditing, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (a.status && a.status !== 'active') return false;
      const matchesSearch = !q || `${displayName(a)} ${a.platform}`.toLowerCase().includes(q);
      const matchesPlatform = platformFilter ? a.platform.toLowerCase() === platformFilter.toLowerCase() : true;
      return matchesSearch && matchesPlatform;
    });
  }, [accounts, search, platformFilter]);
  const selectedSet = useMemo(() => new Set(selected.map((v) => v.toLowerCase())), [selected]);

  const toggle = (accountId: string) =>
    setSelected((prev) => {
      const key = accountId.toLowerCase();
      return prev.some((x) => x.toLowerCase() === key) ? prev.filter((x) => x.toLowerCase() !== key) : [...prev, accountId];
    });
  const selectAll = () =>
    setSelected((prev) => {
      const seen = new Set(prev.map((v) => v.toLowerCase()));
      const next = [...prev];
      for (const a of filtered) {
        if (seen.has(a.id.toLowerCase())) continue;
        seen.add(a.id.toLowerCase());
        next.push(a.id);
      }
      return next;
    });
  const deselectAll = () => {
    const ids = new Set(filtered.map((a) => a.id.toLowerCase()));
    setSelected((prev) => prev.filter((x) => !ids.has(x.toLowerCase())));
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), description: description.trim(), socialAccountIds: selected };
      if (isEditing && id) {
        await updateCampaign(id, data);
        toast.success('Campaign updated successfully');
        navigate(`/campaigns/${id}`);
      } else {
        const campaign = await createCampaign(data);
        toast.success('Campaign created successfully');
        navigate(`/campaigns/${campaign.id}`);
      }
    } catch (error) {
      toast.error((error as Error)?.message || 'Failed to save campaign');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState minHeight={400} />;
  const platforms = Array.from(new Set(accounts.map((a) => a.platform))).filter(Boolean);

  return (
    <Page width="default" density="compact">
      <PageHeader
        title={isEditing ? 'Edit Campaign' : 'Create New Campaign'}
        description={isEditing ? 'Update your campaign settings and target channels.' : 'Set up a new campaign and select which channels will participate.'}
        backLink={{ label: 'Back', onClick: () => navigate(-1) }}
      />
      <div className="v2-split">
        <div className="flex flex-col gap-4">
          <Section variant="card" title="Basic Information" description="General details about your campaign.">
            <div className="flex flex-col gap-3">
              <TextField variant="outlined" label="Campaign Name" placeholder="e.g. Q4 Growth Sprint" value={name} onValueChange={setName} fullWidth required />
              <TextField variant="outlined" label="Description" placeholder="What is the goal of this campaign?" value={description} onValueChange={setDescription} multiline rows={4} maxRows={10} fullWidth />
            </div>
          </Section>
          <Section variant="tonal" title="Selection Summary">
            <div className="v2-stat-grid">
              <StatTile icon="share" label="Channels Selected" value={selected.length} tone="primary" />
              <StatTile icon="groups" label="Total Available" value={accounts.length} />
              <StatTile icon="pie_chart" label="Coverage" value={`${Math.round((selected.length / accounts.length) * 100) || 0}%`} tone="tertiary" />
            </div>
            <Button variant="filled" size="md" icon={isEditing ? 'save' : 'rocket_launch'} loading={saving} fullWidth emphasized onClick={() => void save()} className="mt-3">
              {isEditing ? 'Save Changes' : 'Launch Campaign'}
            </Button>
          </Section>
        </div>
        <Section
          variant="card"
          title="Channel Selection"
          description="Select which accounts will be used for this campaign."
          actions={
            <>
              <Button variant="text" size="xs" onClick={selectAll}>
                Select All
              </Button>
              <Button variant="text" size="xs" onClick={deselectAll}>
                Deselect All
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <SearchField shape="field" value={search} onChange={setSearch} placeholder="Search by username or platform..." />
            <div className="flex flex-wrap gap-2">
              {platforms.map((platform) => (
                <Button key={platform} variant={platformFilter === platform ? 'filled' : 'outlined'} size="xs" icon={<PlatformIcon platform={platform} size={16} />} onClick={() => setPlatformFilter(platformFilter === platform ? null : platform)}>
                  {platformLabel(platform)}
                </Button>
              ))}
            </div>
            <div className="v2-pick-grid">
              {filtered.map((account) => {
                const on = selectedSet.has(account.id.toLowerCase());
                return (
                  <button key={account.id} type="button" role="checkbox" aria-checked={on} className="v2-destination m3-focus-ring" data-selected={on ? '' : undefined} onClick={() => toggle(account.id)}>
                    <Ripple />
                    <AccountAvatar account={account} size={36} refreshOn={['twitter', 'x', 'threads']} />
                    <span className="flex min-w-0 flex-1 flex-col text-start">
                      <Text as="span" variant="label-large" className="truncate">
                        {displayName(account)}
                      </Text>
                      <Text as="span" variant="label-small" className="text-on-surface-variant">
                        {platformLabel(account.platform)}
                      </Text>
                    </span>
                    <Icon name={on ? 'check_circle' : 'radio_button_unchecked'} filled={on} className={on ? 'text-primary' : 'text-on-surface-variant'} />
                  </button>
                );
              })}
            </div>
            {filtered.length === 0 && (
              <EmptyState
                icon="search_off"
                size="inline"
                title="No accounts found matching your search."
                action={
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setPlatformFilter(null);
                    }}
                  >
                    Clear all filters
                  </Button>
                }
              />
            )}
          </div>
        </Section>
      </div>
    </Page>
  );
}
