import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Share2,
  Trash2,
  Twitter,
} from 'lucide-react';
import { toast } from 'sonner';
import { disconnectSocialAccount, fetchSocialAccounts } from '../api';
import { PageHeader } from '../components/PageHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface SocialAccount {
  id: string;
  platform: string;
  accountId: string;
  profileName?: string | null;
  avatarUrl?: string | null;
  status?: string;
  expiresAt?: string | null;
  updatedAt?: string;
}

function fallbackAvatar(id: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(id)}`;
}

function displayName(account: SocialAccount) {
  return account.profileName || account.accountId || account.platform;
}

export function CampaignChannels() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SocialAccount | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await fetchSocialAccounts();
      setAccounts(data);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const handleDisconnect = async (account: SocialAccount) => {
    try {
      setDisconnectingId(account.id);
      await disconnectSocialAccount(account.platform, account.id);
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      toast.success('Channel disconnected');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to disconnect channel');
    } finally {
      setDisconnectingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 overflow-y-auto relative">
      <div className="w-full space-y-8 pb-20">
        <PageHeader
          title="Channels"
          description="Connect and manage the accounts campaigns publish to."
          backLink={{ to: '/campaigns', label: 'Back to Campaigns' }}
          actions={(
            <a
              href="/api/social/twitter/connect"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/10 transition hover:bg-indigo-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Connect X
            </a>
          )}
        />

        <section className="overflow-hidden rounded-xl border border-neutral-200/50 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/70">
          <div className="border-b border-neutral-200/50 bg-neutral-100/60 p-6 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 shadow-lg shadow-indigo-500/5">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-950 dark:text-white">Connected Channels</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">These channels are available when creating or editing campaigns.</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-neutral-950 dark:text-white" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-white">
                <Twitter className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-neutral-950 dark:text-white">No channels connected</h3>
              <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
                Connect an X account before assigning channels to campaigns.
              </p>
              <a
                href="/api/social/twitter/connect"
                className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-indigo-700 bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Connect X
              </a>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-white/10">
              {accounts.map((account) => (
                <div key={account.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <img
                      src={account.avatarUrl || fallbackAvatar(account.id)}
                      alt={displayName(account)}
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 shrink-0 rounded-full border border-neutral-200 bg-neutral-100 object-cover dark:border-white/10 dark:bg-neutral-800"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-neutral-950 dark:text-white">{displayName(account)}</h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          {account.status || 'active'}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                        <span className="inline-flex items-center gap-1">
                          <Twitter className="h-3.5 w-3.5" />
                          {account.platform === 'twitter' ? 'X' : account.platform}
                        </span>
                        <span>Account ID: {account.accountId}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    <a
                      href="/api/social/twitter/connect"
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-neutral-200/50 bg-white/40 px-3 text-sm font-bold text-neutral-700 transition hover:bg-white/60 dark:border-white/5 dark:bg-neutral-950/30 dark:text-neutral-200 dark:hover:bg-white/10"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Reconnect
                    </a>
                    <button
                      type="button"
                      disabled={disconnectingId === account.id}
                      onClick={() => setDeleteTarget(account)}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-red-500/10 px-3 text-sm font-bold text-red-600 transition hover:bg-red-500/20 disabled:opacity-50"
                    >
                      {disconnectingId === account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Disconnect Channel"
        description={`Are you sure you want to disconnect ${deleteTarget ? displayName(deleteTarget) : ''}? Campaigns using this channel will stop targeting it.`}
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        onConfirm={() => deleteTarget && void handleDisconnect(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}
