import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { adminResetUserPassword, createUser, getUserDetail, getUsers, updateUserRole, updateUserStatus, updateUserStorageLimit } from '../../api';
import { Avatar, Button, DataTable, Dialog, Icon, Select, SideSheet, Text, TextField, useSnackbar } from '../../m3';
import type { UserDetail, UserRole, UserStatus, UserSummary } from '../../types';
import { useAuth } from '../app/auth';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ErrorState, LoadingState, Page, PageHeader, Section } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { SearchField } from '../ui/SearchField';
import { StatTile, StatusPill } from '../ui/Stat';

type Filters = { q: string; role: UserRole | 'all'; status: UserStatus | 'all'; page: number; pageSize: number };
const INITIAL: Filters = { q: '', role: 'all', status: 'all', page: 1, pageSize: 20 };

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function AdminUsers() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { user: currentUser } = useAuth();
  const TIERS = useMemo(
    () => [
      { name: 'Free (5GB)', value: 5 * 1024 ** 3 },
      { name: 'Professional (100GB)', value: 100 * 1024 ** 3 },
      { name: 'Premium (500GB)', value: 500 * 1024 ** 3 },
    ],
    [],
  );
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [searchInput, setSearchInput] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const blankForm = { email: '', password: '', role: 'user' as UserRole, status: 'disabled' as UserStatus, storageLimit: TIERS[0].value };
  const [form, setForm] = useState(blankForm);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<{ userId: string; status: UserStatus; email: string } | null>(null);
  const [pendingRole, setPendingRole] = useState<{ userId: string; role: UserRole; email: string } | null>(null);

  const formatDate = (value?: number) => (value ? new Date(value).toLocaleString() : t('adminUsers.never'));
  const relative = (value?: number) => {
    if (!value) return t('adminUsers.never');
    const minutes = Math.round((Date.now() - value) / 60000);
    if (minutes < 1) return t('adminUsers.justNow');
    if (minutes < 60) return t('adminUsers.relativeTime.m', { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('adminUsers.relativeTime.h', { count: hours });
    const days = Math.round(hours / 24);
    if (days < 30) return t('adminUsers.relativeTime.d', { count: days });
    return new Date(value).toLocaleDateString();
  };
  const tierName = (limit?: number) => TIERS.find((tier) => Math.abs(tier.value - (limit || 0)) < 1000)?.name || 'Custom';
  const canResetPassword = activeUser && currentUser && activeUser.id !== currentUser.id;

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getUsers(filters);
      setUsers(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err) {
      setError((err as Error).message || t('adminUsers.errors.loadUsers'));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      setActiveUser(await getUserDetail(userId));
      setResetPassword('');
    } catch (err) {
      setDetailError((err as Error).message || t('adminUsers.errors.loadDetail'));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((c) => ({ ...c, q: searchInput.trim(), page: 1 })), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!activeUserId) {
      setActiveUser(null);
      setDetailError('');
      return;
    }
    void loadDetail(activeUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUserId]);

  const refreshAll = async (userId?: string) => {
    await loadUsers();
    if (userId || activeUserId) await loadDetail(userId || activeUserId!);
  };

  const fail = (err: unknown, key: string) => {
    const message = (err as Error).message || t(key);
    setError(message);
    snackbar.show(message);
  };

  const changeStorage = async (userId: string, limit: number) => {
    try {
      await updateUserStorageLimit(userId, limit);
      snackbar.show(t('adminUsers.toasts.storageUpdated'));
      await refreshAll(userId);
    } catch (err) {
      fail(err, 'adminUsers.errors.updateStorage');
    }
  };

  const submitCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    setCreating(true);
    setError('');
    try {
      await createUser(form);
      snackbar.show(t('adminUsers.toasts.userCreated'));
      setCreateOpen(false);
      setForm(blankForm);
      setFilters((c) => ({ ...c, page: 1 }));
      await loadUsers();
    } catch (err) {
      fail(err, 'adminUsers.errors.createUser');
    } finally {
      setCreating(false);
    }
  };

  const submitReset = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeUser) return;
    setResetting(true);
    try {
      await adminResetUserPassword(activeUser.id, resetPassword);
      snackbar.show(t('adminUsers.toasts.passwordReset'));
      setResetPassword('');
      await loadDetail(activeUser.id);
    } catch (err) {
      fail(err, 'adminUsers.errors.resetPassword');
    } finally {
      setResetting(false);
    }
  };

  const roleOptions = [
    { value: 'user', label: t('adminUsers.user') },
    { value: 'admin', label: t('adminUsers.admin') },
  ];

  return (
    <Page density="compact">
      <PageHeader
        size="large"
        title={t('adminUsers.title')}
        description={t('adminUsers.description')}
        actions={
          <>
            <Button variant="tonal" icon="mail" href="/admin/invites">
              {t('adminUsers.inviteUsers')}
            </Button>
            <Button variant="filled" icon="person_add" onClick={() => setCreateOpen(true)}>
              {t('adminUsers.createUser')}
            </Button>
          </>
        }
      />

      {error && <ErrorState message={error} />}

      <DataTable<UserSummary>
        aria-label={t('adminUsers.title')}
        density="compact"
        loading={loading}
        rows={users}
        getRowId={(u) => u.id}
        onRowClick={(u) => setActiveUserId(u.id)}
        toolbar={
          <div className="flex flex-wrap items-center gap-2 p-2">
            <SearchField value={searchInput} onChange={setSearchInput} placeholder={t('adminUsers.searchPlaceholder')} className="flex-1" />
            <Select
              variant="outlined"
              aria-label={t('adminUsers.table.role')}
              value={filters.role}
              onChange={(role) => setFilters((c) => ({ ...c, role: role as Filters['role'], page: 1 }))}
              options={[{ value: 'all', label: t('adminUsers.allRoles') }, ...roleOptions]}
            />
            <Select
              variant="outlined"
              aria-label={t('adminUsers.table.status')}
              value={filters.status}
              onChange={(status) => setFilters((c) => ({ ...c, status: status as Filters['status'], page: 1 }))}
              options={[
                { value: 'all', label: t('adminUsers.allStatuses') },
                { value: 'active', label: t('adminUsers.active') },
                { value: 'disabled', label: t('adminUsers.disabled') },
              ]}
            />
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-12">
            <Icon name="group" size={40} className="text-on-surface-variant" />
            <Text variant="title-medium">{t('adminUsers.noUsersFound')}</Text>
            <Text variant="body-small" className="text-on-surface-variant">
              {t('adminUsers.adjustFilters')}
            </Text>
          </div>
        }
        columns={[
          {
            key: 'user',
            header: t('adminUsers.table.user'),
            cell: (u) => (
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={u.email} size={32} />
                <span className="flex min-w-0 flex-col">
                  <Text as="span" variant="label-large" emphasized className="truncate">
                    {u.email}
                  </Text>
                  <Text as="span" variant="body-small" className="truncate font-mono text-on-surface-variant">
                    {u.id}
                  </Text>
                </span>
              </span>
            ),
          },
          { key: 'role', header: t('adminUsers.table.role'), width: 100, cell: (u) => <StatusPill tone={u.role === 'admin' ? 'warning' : 'neutral'}>{u.role}</StatusPill> },
          { key: 'status', header: t('adminUsers.table.status'), width: 100, cell: (u) => <StatusPill tone={u.status === 'active' ? 'success' : 'error'}>{u.status}</StatusPill> },
          {
            key: 'storage',
            header: t('adminUsers.table.storage'),
            width: 170,
            hideBelow: 900,
            cell: (u) => (
              <span className="flex flex-col">
                <span>
                  {formatBytes(u.usedStorage)} / {formatBytes(u.storageLimit || 0)}
                </span>
                <Text as="span" variant="body-small" className="text-on-surface-variant">
                  {tierName(u.storageLimit)}
                </Text>
              </span>
            ),
          },
          { key: 'projects', header: t('adminUsers.table.projects'), width: 90, numeric: true, hideBelow: 1100, cell: (u) => u.projectCount },
          { key: 'libraries', header: t('adminUsers.table.libraries'), width: 90, numeric: true, hideBelow: 1100, cell: (u) => u.libraryCount },
          {
            key: 'lastLogin',
            header: t('adminUsers.table.lastLogin'),
            width: 150,
            hideBelow: 700,
            cell: (u) => (
              <span className="flex flex-col">
                <span>{relative(u.lastLoginAt)}</span>
                <Text as="span" variant="body-small" className="text-on-surface-variant">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : t('adminUsers.neverSignedIn')}
                </Text>
              </span>
            ),
          },
        ]}
        actionsHeader={t('adminUsers.table.actions')}
        actionsWidth={130}
        rowActions={(u) => (
          <Select
            variant="outlined"
            aria-label={t('adminUsers.table.role')}
            value={u.role}
            disabled={u.id === currentUser?.id}
            onChange={(role) => setPendingRole({ userId: u.id, role: role as UserRole, email: u.email })}
            options={roleOptions}
            className="v2-inline-select"
          />
        )}
      />

      <div className="v2-paged-footer">
        <Text variant="body-medium" className="text-on-surface-variant">
          {total > 0 ? t('adminUsers.showingUsers', { count: users.length, total }) : t('adminUsers.noUsersToShow')}
        </Text>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            variant="outlined"
            aria-label={t('pagination.pageSize')}
            value={String(filters.pageSize)}
            onChange={(size) => setFilters((c) => ({ ...c, pageSize: Number(size), page: 1 }))}
            options={[20, 50, 100].map((n) => ({ value: String(n), label: t('adminUsers.pageSize', { count: n }) }))}
            className="v2-page-size"
          />
          <Text variant="label-medium" className="text-on-surface-variant">
            {t('adminUsers.pagination', { current: filters.page, total: pages })}
          </Text>
          <Pagination page={filters.page} pages={pages} onPageChange={(page) => setFilters((c) => ({ ...c, page }))} />
        </div>
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        icon="person_add"
        headline={t('adminUsers.createModal.title')}
        maxWidth={560}
        fullScreen="compact"
        confirmAction={
          <Button variant="filled" loading={creating} onClick={() => void submitCreate()}>
            {t('adminUsers.createModal.submit')}
          </Button>
        }
        actions={
          <>
            <Button variant="text" onClick={() => setCreateOpen(false)}>
              {t('adminUsers.createModal.cancel')}
            </Button>
            <Button variant="filled" icon="person_add" loading={creating} onClick={() => void submitCreate()}>
              {t('adminUsers.createModal.submit')}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void submitCreate(e)} className="flex flex-col gap-4">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('adminUsers.createModal.description')}
          </Text>
          <TextField variant="outlined" type="email" required label={t('adminUsers.createModal.email')} value={form.email} onValueChange={(email) => setForm((c) => ({ ...c, email }))} fullWidth />
          <TextField
            variant="outlined"
            type="password"
            minLength={8}
            label={`${t('adminUsers.createModal.password')} ${t('adminUsers.createModal.optional')}`}
            placeholder={t('adminUsers.createModal.passwordPlaceholder')}
            value={form.password}
            onValueChange={(password) => setForm((c) => ({ ...c, password }))}
            passwordToggle
            fullWidth
          />
          <div className="grid gap-4 md:grid-cols-3">
            <Select variant="outlined" label={t('adminUsers.createModal.role')} value={form.role} onChange={(role) => setForm((c) => ({ ...c, role: role as UserRole }))} options={roleOptions} fullWidth />
            <Select
              variant="outlined"
              label={t('adminUsers.createModal.status')}
              value={form.status}
              onChange={(status) => setForm((c) => ({ ...c, status: status as UserStatus }))}
              options={[
                { value: 'active', label: t('adminUsers.active') },
                { value: 'disabled', label: t('adminUsers.disabled') },
              ]}
              fullWidth
            />
            <Select
              variant="outlined"
              label={t('adminUsers.createModal.storage')}
              value={String(form.storageLimit)}
              onChange={(v) => setForm((c) => ({ ...c, storageLimit: Number(v) }))}
              options={TIERS.map((tier) => ({ value: String(tier.value), label: tier.name }))}
              fullWidth
            />
          </div>
          <button type="submit" hidden />
        </form>
      </Dialog>

      <SideSheet open={!!activeUserId} onClose={() => setActiveUserId(null)} modal width={640} headline={t('adminUsers.detail.title')}>
        <div className="flex flex-col gap-5 pb-6" data-density="compact">
          <Text variant="body-medium" className="text-on-surface-variant">
            {t('adminUsers.detail.description')}
          </Text>
          {detailLoading ? (
            <LoadingState />
          ) : detailError ? (
            <ErrorState message={detailError} />
          ) : activeUser ? (
            <>
              <Section variant="tonal">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Text variant="label-small" className="uppercase tracking-widest text-on-surface-variant">
                      {t('adminUsers.detail.account')}
                    </Text>
                    <Text variant="title-large" emphasized className="break-all">
                      {activeUser.email}
                    </Text>
                    <Text variant="body-small" className="font-mono text-on-surface-variant">
                      {activeUser.id}
                    </Text>
                  </div>
                  <div className="flex gap-2">
                    <StatusPill tone={activeUser.role === 'admin' ? 'warning' : 'neutral'}>{activeUser.role}</StatusPill>
                    <StatusPill tone={activeUser.status === 'active' ? 'success' : 'error'}>{activeUser.status}</StatusPill>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['schedule', 'adminUsers.detail.created', formatDate(activeUser.createdAt)],
                      ['login', 'adminUsers.detail.lastLogin', formatDate(activeUser.lastLoginAt)],
                      ['hard_drive', 'adminUsers.detail.storageTier', tierName(activeUser.storageLimit)],
                      ['shield', 'adminUsers.detail.usedLimit', `${formatBytes(activeUser.usedStorage)} / ${formatBytes(activeUser.storageLimit || 0)}`],
                      ['group', 'adminUsers.detail.createdBy', activeUser.createdBy?.email || t('adminUsers.detail.selfRegistered')],
                      ['confirmation_number', 'adminUsers.detail.inviteCode', activeUser.inviteCode?.code || t('adminUsers.detail.notInviteBased')],
                      ['sticky_note_2', 'adminUsers.detail.inviteNote', activeUser.inviteCode?.note || t('adminUsers.detail.noNote')],
                    ] as const
                  ).map(([icon, key, value]) => (
                    <div key={key} className="v2-kv">
                      <Text as="span" variant="label-small" className="inline-flex items-center gap-1 uppercase tracking-widest text-on-surface-variant">
                        <Icon name={icon} size={14} />
                        {t(key)}
                      </Text>
                      <Text as="span" variant="body-medium" className="break-all">
                        {value}
                      </Text>
                    </div>
                  ))}
                </div>
              </Section>
              <div className="v2-stat-grid">
                <StatTile label={t('adminUsers.detail.projects')} value={activeUser.projectCount} />
                <StatTile label={t('adminUsers.detail.libraries')} value={activeUser.libraryCount} />
                <StatTile label={t('adminUsers.detail.providers')} value={activeUser.providerCount} />
                <StatTile label={t('adminUsers.detail.exports')} value={activeUser.exportCount} />
              </div>
              <Section variant="tonal" title={t('adminUsers.detail.storageBreakdown')}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ['adminUsers.detail.projects', activeUser.storageBreakdown.projects],
                      ['adminUsers.detail.libraries', activeUser.storageBreakdown.libraries],
                      ['adminUsers.detail.exports', activeUser.storageBreakdown.exports],
                      ['adminUsers.detail.trash', activeUser.storageBreakdown.trash],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="v2-kv v2-kv--row">
                      <Text as="span" variant="body-medium" className="text-on-surface-variant">
                        {t(key)}
                      </Text>
                      <Text as="span" variant="label-large" emphasized>
                        {formatBytes(value)}
                      </Text>
                    </div>
                  ))}
                </div>
              </Section>
              <Section variant="tonal" title={t('adminUsers.detail.adminControls')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select
                    variant="outlined"
                    label={t('adminUsers.table.role')}
                    value={activeUser.role}
                    disabled={activeUser.id === currentUser?.id}
                    onChange={(role) => setPendingRole({ userId: activeUser.id, role: role as UserRole, email: activeUser.email })}
                    options={roleOptions}
                    fullWidth
                  />
                  <Select
                    variant="outlined"
                    label={t('adminUsers.detail.limit')}
                    value={String(activeUser.storageLimit || TIERS[0].value)}
                    onChange={(v) => void changeStorage(activeUser.id, Number(v))}
                    options={TIERS.map((tier) => ({ value: String(tier.value), label: tier.name }))}
                    fullWidth
                  />
                </div>
                <Button
                  variant="tonal"
                  icon={activeUser.status === 'active' ? 'block' : 'check_circle'}
                  className={activeUser.status === 'active' ? 'v2-button-danger self-start' : 'self-start'}
                  disabled={activeUser.id === currentUser?.id}
                  onClick={() => setPendingStatus({ userId: activeUser.id, status: activeUser.status === 'active' ? 'disabled' : 'active', email: activeUser.email })}
                >
                  {activeUser.status === 'active' ? t('adminUsers.detail.disableUser') : t('adminUsers.detail.enableUser')}
                </Button>
              </Section>
              <Section variant="tonal" icon={<Icon name="key" />} title={t('adminUsers.detail.passwordReset')}>
                {canResetPassword ? (
                  <form onSubmit={(e) => void submitReset(e)} className="flex flex-col gap-3">
                    <TextField variant="outlined" type="password" minLength={8} required label={t('adminUsers.detail.newPassword')} value={resetPassword} onValueChange={setResetPassword} passwordToggle fullWidth />
                    <Button type="submit" variant="filled" icon="key" loading={resetting} className="self-start">
                      {t('adminUsers.detail.resetSubmit')}
                    </Button>
                  </form>
                ) : (
                  <Text variant="body-medium" className="text-on-surface-variant">
                    {t('adminUsers.detail.ownPasswordNote')}
                  </Text>
                )}
              </Section>
            </>
          ) : null}
        </div>
      </SideSheet>

      <ConfirmDialog
        open={pendingRole !== null}
        tone="danger"
        title={pendingRole?.role === 'admin' ? t('adminUsers.confirm.promoteTitle') : t('adminUsers.confirm.demoteTitle')}
        message={pendingRole ? (pendingRole.role === 'admin' ? t('adminUsers.confirm.promoteMessage', { email: pendingRole.email }) : t('adminUsers.confirm.demoteMessage', { email: pendingRole.email })) : ''}
        confirmLabel={pendingRole?.role === 'admin' ? t('adminUsers.confirm.promoteTitle') : t('adminUsers.confirm.demoteTitle')}
        onClose={() => setPendingRole(null)}
        onConfirm={async () => {
          if (!pendingRole) return;
          try {
            await updateUserRole(pendingRole.userId, pendingRole.role);
            snackbar.show(t('adminUsers.toasts.roleUpdated'));
            await refreshAll(pendingRole.userId);
          } catch (err) {
            fail(err, 'adminUsers.errors.updateRole');
          }
        }}
      />
      <ConfirmDialog
        open={pendingStatus !== null}
        tone={pendingStatus?.status === 'active' ? 'default' : 'danger'}
        title={pendingStatus?.status === 'active' ? t('adminUsers.confirm.enableTitle') : t('adminUsers.confirm.disableTitle')}
        message={pendingStatus ? (pendingStatus.status === 'active' ? t('adminUsers.confirm.enableMessage', { email: pendingStatus.email }) : t('adminUsers.confirm.disableMessage', { email: pendingStatus.email })) : ''}
        confirmLabel={pendingStatus?.status === 'active' ? t('adminUsers.confirm.enableTitle') : t('adminUsers.confirm.disableTitle')}
        onClose={() => setPendingStatus(null)}
        onConfirm={async () => {
          if (!pendingStatus) return;
          try {
            await updateUserStatus(pendingStatus.userId, pendingStatus.status);
            snackbar.show(pendingStatus.status === 'active' ? t('adminUsers.toasts.userEnabled') : t('adminUsers.toasts.userDisabled'));
            await refreshAll(pendingStatus.userId);
          } catch (err) {
            fail(err, 'adminUsers.errors.updateStatus');
          }
        }}
      />
    </Page>
  );
}
