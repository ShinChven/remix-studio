import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createCampaign, fetchCampaign, fetchSocialAccounts, updateCampaign } from '../../api';
import { Button, ChipSet, FilterChip, Icon, Ripple, Text, TextField } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { PlatformIcon, platformLabel } from '../lib/platform';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { SearchField } from '../ui/SearchField';
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
  const { t } = useTranslation();
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
      toast.error(errorText(error, t('v2.campaigns.loadCampaignFailed')));
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
      toast.error(t('v2.campaigns.form.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), description: description.trim(), socialAccountIds: selected };
      if (isEditing && id) {
        await updateCampaign(id, data);
        toast.success(t('v2.campaigns.form.updated'));
        navigate(`/campaigns/${id}`);
      } else {
        const campaign = await createCampaign(data);
        toast.success(t('v2.campaigns.form.created'));
        navigate(`/campaigns/${campaign.id}`);
      }
    } catch (error) {
      toast.error(errorText(error, t('v2.campaigns.form.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState minHeight={400} />;
  const platforms = Array.from(new Set(accounts.map((a) => a.platform))).filter(Boolean);

  const usable = accounts.filter((a) => !a.status || a.status === 'active');

  return (
    <Page density="compact">
      <PageHeader
        title={isEditing ? t('v2.campaigns.settings') : t('v2.campaigns.newCampaign')}
        description={isEditing ? t('v2.campaigns.form.editHint') : t('v2.campaigns.form.newHint')}
        backLink={{ label: t('v2.campaigns.postForm.back'), onClick: () => navigate(-1) }}
      />
      <div className="v2-split">
        <div className="v2-split__rail flex flex-col gap-4">
          <Section variant="card" title={t('v2.campaigns.form.details')}>
            <div className="flex flex-col gap-3">
              <TextField variant="outlined" label={t('v2.campaigns.form.name')} placeholder={t('v2.campaigns.form.namePlaceholder')} value={name} onValueChange={setName} fullWidth required />
              <TextField variant="outlined" label={t('v2.campaigns.form.description')} placeholder={t('v2.campaigns.form.descriptionPlaceholder')} value={description} onValueChange={setDescription} multiline rows={4} maxRows={10} fullWidth />
            </div>
          </Section>
          <div className="flex flex-col gap-2">
            <Button variant="filled" size="md" icon={isEditing ? 'save' : 'rocket_launch'} loading={saving} fullWidth emphasized onClick={() => void save()}>
              {isEditing ? t('v2.campaigns.form.saveChanges') : t('v2.campaigns.form.create')}
            </Button>
            <Button variant="text" fullWidth disabled={saving} onClick={() => navigate(-1)}>
              {t('confirmModal.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
        <Section
          variant="card"
          title={
            <>
              {t('channels')} {usable.length > 0 && <span className="v2-count">{t('v2.campaigns.form.selectedOf', { selected: selected.length, total: usable.length })}</span>}
            </>
          }
          description={t('v2.campaigns.form.channelsHint')}
          actions={
            usable.length > 1 && (
              <>
                <Button variant="text" size="xs" onClick={selectAll}>
                  {t('v2.campaigns.form.selectAll')}
                </Button>
                <Button variant="text" size="xs" onClick={deselectAll}>
                  {t('v2.campaigns.form.clear')}
                </Button>
              </>
            )
          }
        >
          {usable.length === 0 ? (
            <EmptyState
              icon="share"
              shape="flower"
              size="inline"
              title={t('v2.campaigns.channelsPage.none')}
              description={t('v2.campaigns.form.noChannelsHint')}
              action={
                <Button variant="tonal" size="sm" icon="add_link" href="/campaigns/channels">
                  {t('v2.campaigns.form.manageChannels')}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {usable.length > 6 && <SearchField shape="field" value={search} onChange={setSearch} placeholder={t('v2.campaigns.form.searchChannels')} aria-label={t('v2.campaigns.form.searchChannels')} />}
              {platforms.length > 1 && (
                <ChipSet aria-label={t('v2.campaigns.form.filterByPlatform')}>
                  {platforms.map((platform) => (
                    <FilterChip key={platform} icon={<PlatformIcon platform={platform} size={16} />} label={platformLabel(platform)} selected={platformFilter === platform} onClick={() => setPlatformFilter(platformFilter === platform ? null : platform)} />
                  ))}
                </ChipSet>
              )}
              <div className="v2-pick-grid">
                {filtered.map((account) => {
                  const on = selectedSet.has(account.id.toLowerCase());
                  return (
                    <button key={account.id} type="button" role="checkbox" aria-checked={on} className="v2-destination m3-focus-ring" data-selected={on ? '' : undefined} onClick={() => toggle(account.id)}>
                      <Ripple />
                      <AccountAvatar account={account} size={40} refreshOn={['twitter', 'x', 'threads']} />
                      <span className="flex min-w-0 flex-1 flex-col text-start">
                        <Text as="span" variant="label-large" className="truncate">
                          {displayName(account)}
                        </Text>
                        <Text as="span" variant="label-small" className="opacity-70">
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
                  title={t('v2.campaigns.form.noChannelsMatch')}
                  action={
                    <Button
                      variant="text"
                      size="sm"
                      onClick={() => {
                        setSearch('');
                        setPlatformFilter(null);
                      }}
                    >
                      {t('v2.common.clearFilters')}
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
}
