import { useEffect, useMemo, useState } from 'react';
import { Copy, Link as LinkIcon, Loader2, Plus, Ticket, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createAdminInvite, deleteAdminInvite, getAdminInvites } from '../api';
import type { InviteCode } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageHeader } from '../components/PageHeader';
import { toast } from 'sonner';

export function AdminInvites() {
  const { t } = useTranslation();

  const MEMBERSHIP_TIERS = useMemo(() => [
    { value: 'free', label: 'Free (5GB)' },
    { value: 'professional', label: 'Professional (100GB)' },
    { value: 'premium', label: 'Premium (500GB)' },
  ] as const, []);

  const formatDate = (value?: number) => {
    if (!value) return t('adminUsers.never');
    return new Date(value).toLocaleString();
  };

  const membershipTierLabel = (value: InviteCode['membershipTier']) => {
    return MEMBERSHIP_TIERS.find((tier) => tier.value === value)?.label || 'Free (5GB)';
  };

  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [membershipTier, setMembershipTier] = useState<InviteCode['membershipTier']>('free');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [inviteToDelete, setInviteToDelete] = useState<InviteCode | null>(null);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);

  const loadInvites = async () => {
    setLoading(true);
    setError('');
    try {
      setInvites(await getAdminInvites());
    } catch (err: any) {
      setError(err.message || t('adminInvites.errors.load'));
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
      toast.success(t('adminInvites.toasts.created'));
    } catch (err: any) {
      setError(err.message || t('adminInvites.errors.create'));
      toast.error(err.message || t('adminInvites.errors.create'));
    } finally {
      setCreating(false);
    }
  };

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(t('adminInvites.toasts.copyFailed'));
    }
  };

  const handleDeleteInvite = async () => {
    if (!inviteToDelete) return;

    setDeletingInviteId(inviteToDelete.id);
    setError('');
    try {
      await deleteAdminInvite(inviteToDelete.id);
      setInvites((current) => current.filter((invite) => invite.id !== inviteToDelete.id));
      toast.success(t('adminInvites.toasts.deleted'));
    } catch (err: any) {
      setError(err.message || t('adminInvites.errors.delete'));
      toast.error(err.message || t('adminInvites.errors.delete'));
    } finally {
      setDeletingInviteId(null);
      setInviteToDelete(null);
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <PageHeader
          title={t('adminInvites.title')}
          description={t('adminInvites.description')}
          actions={(
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60 shrink-0"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('adminInvites.createInvite')}
            </button>
          )}
        />

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-4 lg:p-6">
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-neutral-600 dark:text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-neutral-600 dark:text-neutral-400">
              <Ticket className="h-8 w-8 text-neutral-600" />
              <p>{t('adminInvites.noInvites')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-800 text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 dark:text-neutral-500">
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.code')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.tier')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.note')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.usage')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.created')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.lastUsedBy')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.lastUsedAt')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.share')}</th>
                    <th className="px-4 py-3 font-medium">{t('adminInvites.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {invites.map((invite) => {
                    const inviteLink = `${inviteBaseUrl}?inviteCode=${encodeURIComponent(invite.code)}`;
                    const canDelete = invite.usedCount === 0;
                    const isDeleting = deletingInviteId === invite.id;
                    return (
                      <tr key={invite.id} className="text-neutral-200">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="font-mono tracking-[0.2em] text-neutral-900 dark:text-white">{invite.code}</span>
                            <button
                              type="button"
                              onClick={() => void copyText(invite.code, t('adminInvites.codeCopied'))}
                              className="text-neutral-500 dark:text-neutral-500 transition hover:text-white"
                              title={t('adminInvites.copyCode')}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-700 dark:text-neutral-300">{membershipTierLabel(invite.membershipTier)}</td>
                        <td className="px-4 py-4 text-neutral-600 dark:text-neutral-400">
                          {invite.note || <span className="text-neutral-500 dark:text-neutral-500">{t('adminInvites.noNote')}</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-600 dark:text-neutral-400">
                          {invite.usedCount} / {invite.maxUses}
                        </td>
                        <td className="px-4 py-4 text-neutral-600 dark:text-neutral-400">{formatDate(invite.createdAt)}</td>
                        <td className="px-4 py-4">
                          {invite.lastUsedByEmail || <span className="text-neutral-500 dark:text-neutral-500">{t('adminInvites.unused')}</span>}
                        </td>
                        <td className="px-4 py-4 text-neutral-600 dark:text-neutral-400">{formatDate(invite.lastUsedAt)}</td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => void copyText(inviteLink, t('adminInvites.linkCopied'))}
                            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200/50 dark:border-white/5 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl px-3 py-2 text-xs text-neutral-900 dark:text-neutral-200 transition hover:border-neutral-600 hover:bg-neutral-700"
                          >
                            <LinkIcon className="h-3.5 w-3.5" />
                            {t('adminInvites.copyLink')}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => setInviteToDelete(invite)}
                            disabled={!canDelete || isDeleting}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                            title={canDelete ? t('adminInvites.delete') : t('adminInvites.deleteDisabledUsed')}
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            {t('adminInvites.delete')}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md"
          onClick={() => {
            if (!creating) {
              setIsCreateOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-[28px] border border-neutral-200/50 dark:border-white/5 bg-white/40 dark:bg-neutral-900/40 backdrop-blur-3xl p-6 shadow-[0_40px_120px_rgba(0,0,0,0.75)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">{t('adminInvites.createModal.title')}</h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{t('adminInvites.createModal.description')}</p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-700 dark:text-neutral-300">{t('adminInvites.createModal.tier')}</span>
              <select
                value={membershipTier}
                onChange={(event) => setMembershipTier(event.target.value as InviteCode['membershipTier'])}
                className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
              >
                {MEMBERSHIP_TIERS.map((tier) => (
                  <option key={tier.value} value={tier.value}>{tier.label}</option>
                ))}
              </select>
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-700 dark:text-neutral-300">{t('adminInvites.createModal.uses')}</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
              />
            </label>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-neutral-700 dark:text-neutral-300">{t('adminInvites.createModal.note')}</span>
              <textarea
                value={note}
                maxLength={200}
                rows={4}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('adminInvites.createModal.notePlaceholder')}
                className="w-full resize-none rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
              />
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">{note.length}/200</p>
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
                className="rounded-2xl border border-neutral-200 dark:border-neutral-800 px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {t('adminInvites.createModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateInvite}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('adminInvites.createModal.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!inviteToDelete}
        onClose={() => {
          if (!deletingInviteId) {
            setInviteToDelete(null);
          }
        }}
        onConfirm={handleDeleteInvite}
        title={t('adminInvites.deleteModal.title')}
        message={t('adminInvites.deleteModal.message', { code: inviteToDelete?.code ?? '' })}
        confirmText={t('adminInvites.deleteModal.confirm')}
        type="danger"
      />
    </div>
  );
}
