import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { errorText } from '../lib/errors';
import { useAction } from '../lib/useAction';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { disconnectSocialAccount, fetchSocialAccounts } from '../../api';
import { Button } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { platformConnectUrl, platformLabel } from '../lib/platform';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';
import { useAsyncData } from '../lib/useAsyncData';

interface SocialAccount {
  id: string;
  platform: string;
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  status?: string;
}

const displayName = (account: SocialAccount) => account.profileName || account.accountId || account.platform;

/** Friendly copy for the error codes the OAuth callback redirects back with. */
function humanizeConnectError(error: string, t: TFunction): string {
  switch (error) {
    case 'missing_code_or_state':
      return t('v2.campaigns.channelsPage.errorCancelled');
    case 'invalid_state_or_verifier':
      return t('v2.campaigns.channelsPage.errorExpired');
    case 'access_denied':
      return t('v2.campaigns.channelsPage.errorDenied');
    default:
      return t('v2.campaigns.channelsPage.errorOther', { error });
  }
}

function ConnectButtons() {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="filled" icon="add" href="/api/social/twitter/connect">
        {t('v2.campaigns.channelsPage.connect', { name: 'X' })}
      </Button>
      <Button variant="tonal" icon="add" href="/api/social/threads/connect">
        {t('v2.campaigns.channelsPage.connect', { name: 'Threads' })}
      </Button>
    </>
  );
}

/** The social accounts campaigns publish to: connect, reconnect and disconnect. */
export function CampaignChannels() {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const list = useAsyncData<SocialAccount[]>(fetchSocialAccounts, []);
  const accounts = list.data ?? [];
  const setAccounts = (change: (current: SocialAccount[]) => SocialAccount[]) => list.setData((current) => change(current ?? []));
  const [disconnectTarget, setDisconnectTarget] = useState<SocialAccount | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Report the OAuth callback's result, then drop the params so a refresh doesn't repeat it.
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (!success && !error) return;
    if (success === 'connected') toast.success(t('v2.campaigns.channelsPage.connected'));
    else if (error) toast.error(humanizeConnectError(error, t));
    const next = new URLSearchParams(searchParams);
    next.delete('success');
    next.delete('error');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page>
      <PageHeader title={t('channels')} description={t('v2.campaigns.channelsPage.description')} backLink={{ to: '/campaigns', label: t('v2.campaigns.backToCampaigns') }} actions={<ConnectButtons />} />
      <Section variant="plain" icon="share" title={t('v2.campaigns.channelsPage.connectedTitle')} description={t('v2.campaigns.channelsPage.connectedHint')}>
        {list.loading ? (
          <LoadingState minHeight={200} />
        ) : list.error ? (
          <ErrorState message={errorText(list.error, t('v2.campaigns.channelsPage.loadFailed'))} onRetry={() => void list.reload()} retryLabel={t('v2.common.retry')} />
        ) : accounts.length === 0 ? (
          <EmptyState icon="share" shape="flower" title={t('v2.campaigns.channelsPage.none')} description={t('v2.campaigns.channelsPage.noneHint')} action={<div className="flex flex-wrap justify-center gap-2"><ConnectButtons /></div>} />
        ) : (
          <RowList>
            {accounts.map((account) => (
              <Row
                key={account.id}
                lead={<AccountAvatar account={account} size={44} refreshOn={['twitter', 'x', 'threads']} />}
                title={
                  <span className="flex items-center gap-2">
                    {displayName(account)}
                    <StatusPill tone="success" icon="check_circle">
                      {account.status || 'active'}
                    </StatusPill>
                  </span>
                }
                meta={
                  <>
                    <span>{platformLabel(account.platform)}</span>
                    <span>·</span>
                    <span className="font-mono">{t('v2.campaigns.channelsPage.accountId', { id: account.accountId })}</span>
                  </>
                }
                actions={
                  <>
                    <Button variant="tonal" size="xs" icon="open_in_new" href={platformConnectUrl(account.platform)}>
                      {t('v2.campaigns.channelsPage.reconnect')}
                    </Button>
                    <Button variant="text" size="xs" icon="link_off" className="v2-button-danger" onClick={() => setDisconnectTarget(account)}>
                      {t('v2.campaigns.channelsPage.disconnect')}
                    </Button>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </Section>
      <ConfirmDialog
        open={!!disconnectTarget}
        tone="danger"
        title={t('v2.campaigns.channelsPage.disconnectTitle')}
        message={t('v2.campaigns.channelsPage.disconnectMessage', { name: disconnectTarget ? displayName(disconnectTarget) : '' })}
        confirmLabel={t('v2.campaigns.channelsPage.disconnect')}
        onClose={() => setDisconnectTarget(null)}
        onConfirm={async () => {
          if (!disconnectTarget) return;
          await action.run(
            async () => {
              await disconnectSocialAccount(disconnectTarget.platform, disconnectTarget.id);
              setAccounts((prev) => prev.filter((a) => a.id !== disconnectTarget.id));
            },
            { key: disconnectTarget.id, success: t('v2.campaigns.channelsPage.disconnected'), error: t('v2.campaigns.channelsPage.disconnectFailed'), rethrow: true },
          );
        }}
      />
    </Page>
  );
}
