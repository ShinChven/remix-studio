import { useEffect, useMemo, useState } from 'react';
import { Copy, Link as LinkIcon, Loader2, Plus, Ticket } from 'lucide-react';
import { createAdminInvite, getAdminInvites } from '../api';
import type { InviteCode } from '../types';
import { toast } from 'sonner';

const MEMBERSHIP_TIERS = [
  { value: 'free', label: 'Free (5GB)' },
  { value: 'professional', label: 'Professional (100GB)' },
  { value: 'premium', label: 'Premium (500GB)' },
] as const;

function formatDate(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function membershipTierLabel(value: InviteCode['membershipTier']) {
  return MEMBERSHIP_TIERS.find((tier) => tier.value === value)?.label || 'Free (5GB)';
}

export function AdminInvites() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [membershipTier, setMembershipTier] = useState<InviteCode['membershipTier']>('free');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadInvites = async () => {
    setLoading(true);
    setError('');
    try {
      setInvites(await getAdminInvites());
    } catch (err: any) {
      setError(err.message || 'Failed to load invite codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const inviteBaseUrl = useMemo(() => `${window.location.origin}/login`, []);

  const handleCreateInvite = async () => {
    setCreating(true);
    setError('');
    try {
      const trimmedNote = note.trim();
      const parsedMaxUses = Number.parseInt(maxUses, 10);
      const invite = await createAdminInvite({
        note: trimmedNote || undefined,
        maxUses: Number.isInteger(parsedMaxUses) && parsedMaxUses > 0 ? parsedMaxUses : 1,
        membershipTier,
      });
      setInvites((current) => [invite, ...current]);
      setNote('');
      setMaxUses('1');
      setMembershipTier('free');
      setIsCreateOpen(false);
      toast.success('Invite code created');
    } catch (err: any) {
      setError(err.message || 'Failed to create invite code');
      toast.error(err.message || 'Failed to create invite code');
    } finally {
      setCreating(false);
    }
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white font-display">Invite Codes</h2>
            <p className="mt-2 text-sm text-neutral-400">Create invite codes for Google sign-up, set how many people can use each code, and track usage.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Invite Code
          </button>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-4 lg:p-6">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-neutral-400">
              <Ticket className="h-8 w-8 text-neutral-600" />
              <p>No invite codes created yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-800 text-sm">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Tier</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">Usage</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Last Used By</th>
                    <th className="px-4 py-3 font-medium">Last Used At</th>
                    <th className="px-4 py-3 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {invites.map((invite) => {
                    const inviteLink = `${inviteBaseUrl}?inviteCode=${encodeURIComponent(invite.code)}`;
                    return (
                      <tr key={invite.id} className="text-neutral-200">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="font-mono tracking-[0.2em] text-white">{invite.code}</span>
                            <button
                              type="button"
                              onClick={() => void copyText(invite.code, 'Invite code copied')}
                              className="text-neutral-500 transition hover:text-white"
                              title="Copy invite code"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-300">{membershipTierLabel(invite.membershipTier)}</td>
                        <td className="px-4 py-4 text-neutral-400">
                          {invite.note || <span className="text-neutral-500">No note</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-400">
                          {invite.usedCount} / {invite.maxUses}
                        </td>
                        <td className="px-4 py-4 text-neutral-400">{formatDate(invite.createdAt)}</td>
                        <td className="px-4 py-4">
                          {invite.lastUsedByEmail || <span className="text-neutral-500">Unused</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-400">{formatDate(invite.lastUsedAt)}</td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => void copyText(inviteLink, 'Invite link copied')}
                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-700"
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                            Copy Link
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {isCreateOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
          onClick={() => {
            if (!creating) {
              setIsCreateOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-neutral-800 bg-neutral-900 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-white">Create Invite Code</h3>
            <p className="mt-2 text-sm text-neutral-400">Set how many people can use this invite code and add an optional note.</p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-300">Membership Tier</span>
              <select
                value={membershipTier}
                onChange={(event) => setMembershipTier(event.target.value as InviteCode['membershipTier'])}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
              >
                {MEMBERSHIP_TIERS.map((tier) => (
                  <option key={tier.value} value={tier.value}>{tier.label}</option>
                ))}
              </select>
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-300">Allowed Uses</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-300">Note</span>
              <textarea
                value={note}
                maxLength={200}
                rows={4}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Who this invite is for, or what it should be used for"
                className="w-full resize-none rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
              />
              <p className="mt-2 text-xs text-neutral-500">{note.length}/200</p>
            </label>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setNote('');
                  setMaxUses('1');
                  setMembershipTier('free');
                }}
                disabled={creating}
                className="rounded-2xl border border-neutral-800 px-4 py-3 text-sm text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateInvite}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
