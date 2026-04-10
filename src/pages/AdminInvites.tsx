import { useEffect, useMemo, useState } from 'react';
import { Copy, Link as LinkIcon, Loader2, Plus, Ticket } from 'lucide-react';
import { createAdminInvite, getAdminInvites } from '../api';
import type { InviteCode } from '../types';
import { toast } from 'sonner';

function formatDate(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function AdminInvites() {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

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
      const invite = await createAdminInvite(trimmedNote || undefined);
      setInvites((current) => [invite, ...current]);
      setNote('');
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
            <p className="mt-2 text-sm text-neutral-400">Create single-use invite codes for Google sign-up and track who redeemed them.</p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-3 lg:items-end">
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add note for this invite"
              className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
            <button
              type="button"
              onClick={handleCreateInvite}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create Invite Code
            </button>
          </div>
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
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Used By</th>
                    <th className="px-4 py-3 font-medium">Used At</th>
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
                        <td className="px-4 py-4 text-neutral-400">
                          {invite.note || <span className="text-neutral-500">No note</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-400">{formatDate(invite.createdAt)}</td>
                        <td className="px-4 py-4">
                          {invite.usedBy?.email || invite.usedByEmail || <span className="text-neutral-500">Unused</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-400">{formatDate(invite.usedAt)}</td>
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
    </div>
  );
}
