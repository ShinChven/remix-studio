import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAdminInvite, deleteAdminInvite, getAdminInvites } from '../../api';
import { Button, DataTable, Dialog, IconButton, Select, Text, TextField, useSnackbar } from '../../m3';
import type { InviteCode } from '../../types';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, Page, PageHeader } from '../ui/Page';
import { NumberField } from '../ui/NumberField';
import { StatusPill } from '../ui/Stat';

const TIERS = [
  { value: 'free', label: 'Free (5GB)' },
  { value: 'professional', label: 'Professional (100GB)' },
  { value: 'premium', label: 'Premium (500GB)' },
] as const;

export function AdminInvites() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState(1);
  const [tier, setTier] = useState<InviteCode['membershipTier']>('free');
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<InviteCode | null>(null);
  const inviteBase = useMemo(() => `${window.location.origin}/login`, []);

  const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : t('adminUsers.never'));
  const tierLabel = (value: InviteCode['membershipTier']) => TIERS.find((x) => x.value === value)?.label || 'Free (5GB)';

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        setInvites(await getAdminInvites());
      } catch (err) {
        setError((err as Error).message || t('adminInvites.errors.load'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const resetForm = () => {
    setNote('');
    setMaxUses(1);
    setTier('free');
  };

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const invite = await createAdminInvite({ note: note.trim() || undefined, maxUses: Number.isInteger(maxUses) && maxUses > 0 ? maxUses : 1, membershipTier: tier });
      setInvites((current) => [invite, ...current]);
      resetForm();
      setCreateOpen(false);
      snackbar.show(t('adminInvites.toasts.created'));
    } catch (err) {
      const message = (err as Error).message || t('adminInvites.errors.create');
      setError(message);
      snackbar.show(message);
    } finally {
      setCreating(false);
    }
  };

  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      snackbar.show(message);
    } catch {
      snackbar.show(t('adminInvites.toasts.copyFailed'));
    }
  };

  return (
    <Page width="default" density="compact">
      <PageHeader
        size="large"
        title={t('adminInvites.title')}
        description={t('adminInvites.description')}
        backLink={{ to: '/admin/users', label: t('adminUsers.title') }}
        actions={
          <Button variant="filled" icon="add" loading={creating} onClick={() => setCreateOpen(true)}>
            {t('adminInvites.createInvite')}
          </Button>
        }
      />
      {error && <ErrorState message={error} />}
      {!loading && invites.length === 0 ? (
        <EmptyState icon="confirmation_number" shape="clover-4" title={t('adminInvites.noInvites')} />
      ) : (
        <DataTable<InviteCode>
          aria-label={t('adminInvites.title')}
          density="compact"
          loading={loading}
          rows={invites}
          getRowId={(i) => i.id}
          columns={[
            {
              key: 'code',
              header: t('adminInvites.table.code'),
              cell: (i) => (
                <span className="flex items-center gap-1">
                  <span className="font-mono tracking-[0.2em]">{i.code}</span>
                  <IconButton icon="content_copy" label={t('adminInvites.copyCode')} size="xs" onClick={() => void copy(i.code, t('adminInvites.codeCopied'))} />
                </span>
              ),
            },
            { key: 'tier', header: t('adminInvites.table.tier'), cell: (i) => tierLabel(i.membershipTier), hideBelow: 700 },
            { key: 'note', header: t('adminInvites.table.note'), cell: (i) => i.note || <span className="text-on-surface-variant">{t('adminInvites.noNote')}</span>, hideBelow: 900 },
            { key: 'usage', header: t('adminInvites.table.usage'), width: 90, cell: (i) => <StatusPill tone={i.usedCount >= i.maxUses ? 'neutral' : 'success'}>{`${i.usedCount} / ${i.maxUses}`}</StatusPill> },
            { key: 'created', header: t('adminInvites.table.created'), cell: (i) => formatDate(i.createdAt), hideBelow: 1100 },
            { key: 'lastBy', header: t('adminInvites.table.lastUsedBy'), cell: (i) => i.lastUsedByEmail || <span className="text-on-surface-variant">{t('adminInvites.unused')}</span>, hideBelow: 1000 },
            { key: 'lastAt', header: t('adminInvites.table.lastUsedAt'), cell: (i) => formatDate(i.lastUsedAt), hideBelow: 1200 },
          ]}
          actionsHeader={t('adminInvites.table.actions')}
          actionsWidth={210}
          rowActions={(i) => {
            const canDelete = i.usedCount === 0;
            return (
              <span className="flex items-center gap-1">
                <Button variant="tonal" size="xs" icon="link" onClick={() => void copy(`${inviteBase}?inviteCode=${encodeURIComponent(i.code)}`, t('adminInvites.linkCopied'))}>
                  {t('adminInvites.copyLink')}
                </Button>
                <IconButton
                  icon="delete"
                  label={canDelete ? t('adminInvites.delete') : t('adminInvites.deleteDisabledUsed')}
                  tooltip
                  size="xs"
                  className="v2-button-danger"
                  disabled={!canDelete}
                  onClick={() => setToDelete(i)}
                />
              </span>
            );
          }}
        />
      )}

      <Dialog
        open={createOpen}
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
          resetForm();
        }}
        dismissible={!creating}
        icon="confirmation_number"
        headline={t('adminInvites.createModal.title')}
        maxWidth={480}
        actions={
          <>
            <Button
              variant="text"
              disabled={creating}
              onClick={() => {
                setCreateOpen(false);
                resetForm();
              }}
            >
              {t('adminInvites.createModal.cancel')}
            </Button>
            <Button variant="filled" icon="add" loading={creating} onClick={() => void create()}>
              {t('adminInvites.createModal.submit')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('adminInvites.createModal.description')}
          </Text>
          <Select variant="outlined" label={t('adminInvites.createModal.tier')} value={tier} onChange={(v) => setTier(v as InviteCode['membershipTier'])} options={[...TIERS]} fullWidth />
          <NumberField label={t('adminInvites.createModal.uses')} min={1} max={1000} integer stepper value={maxUses} onValueChange={setMaxUses} fullWidth />
          <TextField
            variant="outlined"
            label={t('adminInvites.createModal.note')}
            placeholder={t('adminInvites.createModal.notePlaceholder')}
            value={note}
            onValueChange={setNote}
            maxLength={200}
            multiline
            rows={4}
            fullWidth
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        icon="delete"
        title={t('adminInvites.deleteModal.title')}
        message={t('adminInvites.deleteModal.message', { code: toDelete?.code ?? '' })}
        confirmLabel={t('adminInvites.deleteModal.confirm')}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          setError('');
          try {
            await deleteAdminInvite(toDelete.id);
            setInvites((current) => current.filter((i) => i.id !== toDelete.id));
            snackbar.show(t('adminInvites.toasts.deleted'));
          } catch (err) {
            const message = (err as Error).message || t('adminInvites.errors.delete');
            setError(message);
            snackbar.show(message);
          }
        }}
      />
    </Page>
  );
}

