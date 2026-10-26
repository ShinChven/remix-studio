import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { disconnectSocialAccount, fetchSocialAccounts } from '../../api';
import { Button } from '../../m3';
import { AccountAvatar } from '../components/campaigns/AccountAvatar';
import { platformConnectUrl, platformLabel } from '../lib/platform';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Row, RowList } from '../ui/Rows';
import { StatusPill } from '../ui/Stat';
import { useToast } from '../ui/useToast';

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
function humanizeConnectError(error: string): string {
  switch (error) {
    case 'missing_code_or_state':
      return 'Connection was cancelled or incomplete. Please try again.';
    case 'invalid_state_or_verifier':
      return 'Connection expired or was tampered with. Please try connecting again.';
    case 'access_denied':
      return 'You declined the permission request, so the account was not connected.';
    default:
      return `Could not connect the account: ${error}`;
  }
}

function ConnectButtons() {
  return (
    <>
      <Button variant="filled" icon="add" href="/api/social/twitter/connect">
        Connect X
      </Button>
      <Button variant="tonal" icon="add" href="/api/social/threads/connect">
        Connect Threads
      </Button>
    </>
  );
}

/** The social accounts campaigns publish to: connect, reconnect and disconnect. */
export function CampaignChannels() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectTarget, setDisconnectTarget] = useState<SocialAccount | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setAccounts(await fetchSocialAccounts());
      } catch (error) {
        toast.error((error as Error)?.message || 'Failed to load channels');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report the OAuth callback's result, then drop the params so a refresh doesn't repeat it.
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    if (!success && !error) return;
    if (success === 'connected') toast.success('Channel connected');
    else if (error) toast.error(humanizeConnectError(error));
    const next = new URLSearchParams(searchParams);
    next.delete('success');
    next.delete('error');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page width="default">
      <PageHeader title="Channels" description="Connect and manage the accounts campaigns publish to." backLink={{ to: '/campaigns', label: 'Back to Campaigns' }} actions={<ConnectButtons />} />
      <Section variant="plain" icon="share" title="Connected Channels" description="These channels are available when creating or editing campaigns.">
        {loading ? (
          <LoadingState minHeight={200} />
        ) : accounts.length === 0 ? (
          <EmptyState icon="share" shape="flower" title="No channels connected" description="Connect a channel before assigning it to campaigns." action={<div className="flex flex-wrap justify-center gap-2"><ConnectButtons /></div>} />
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
                    <span className="font-mono">Account ID: {account.accountId}</span>
                  </>
                }
                actions={
                  <>
                    <Button variant="tonal" size="xs" icon="open_in_new" href={platformConnectUrl(account.platform)}>
                      Reconnect
                    </Button>
                    <Button variant="text" size="xs" icon="link_off" className="v2-button-danger" onClick={() => setDisconnectTarget(account)}>
                      Disconnect
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
        title="Disconnect Channel"
        message={`Are you sure you want to disconnect ${disconnectTarget ? displayName(disconnectTarget) : ''}? Campaigns using this channel will stop targeting it.`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        onClose={() => setDisconnectTarget(null)}
        onConfirm={async () => {
          if (!disconnectTarget) return;
          try {
            await disconnectSocialAccount(disconnectTarget.platform, disconnectTarget.id);
            setAccounts((prev) => prev.filter((a) => a.id !== disconnectTarget.id));
            toast.success('Channel disconnected');
          } catch (error) {
            toast.error((error as Error)?.message || 'Failed to disconnect channel');
          }
        }}
      />
    </Page>
  );
}
