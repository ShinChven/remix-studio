import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminResetUserPassword, createUser, getUserDetail, getUsers, updateUserRole, updateUserStatus, updateUserStorageLimit } from '../../api';
import { Button, InputChip, LoadingIndicator, SideSheet } from '../../m3';
import type { UserRole, UserStatus, UserSummary } from '../../types';
import { useAuth } from '../app/auth';
import { CreateUserDialog, ResetPasswordDialog } from '../components/users/UserDialogs';
import { UserRow } from '../components/users/UserRow';
import { UserSheet } from '../components/users/UserSheet';
import { UsersHero, type UsersOverview } from '../components/users/UsersHero';
import { STORAGE_TIERS, tierOf } from '../components/users/userMeta';
import { runEach } from '../lib/bulk';
import { errorText } from '../lib/errors';
import { formatBytes } from '../lib/format';
import { useAction } from '../lib/useAction';
import { useAsyncData } from '../lib/useAsyncData';
import { useCopy } from '../lib/useCopy';
import { useListParams, type PageSize } from '../lib/useListParams';
import { useSelection } from '../lib/useSelection';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { SectionNav } from '../ui/ListBar';
import { ListPane } from '../ui/ListPane';
import { ListSearch } from '../ui/ListSearch';
import { ErrorState, Page } from '../ui/Page';
import { useToast } from '../ui/useToast';

type View = 'all' | UserStatus;
type RoleFilter = 'all' | UserRole;
type SortKey = 'newest' | 'oldest' | 'recent' | 'email' | 'email-desc';

const VIEWS: View[] = ['all', 'active', 'disabled'];
const ROLES: RoleFilter[] = ['all', 'admin', 'user'];
const SORTS: Record<SortKey, { sortBy: 'createdAt' | 'lastLoginAt' | 'email'; sortOrder: 'asc' | 'desc'; icon: string }> = {
  newest: { sortBy: 'createdAt', sortOrder: 'desc', icon: 'south' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc', icon: 'north' },
  recent: { sortBy: 'lastLoginAt', sortOrder: 'desc', icon: 'login' },
  email: { sortBy: 'email', sortOrder: 'asc', icon: 'sort_by_alpha' },
  'email-desc': { sortBy: 'email', sortOrder: 'desc', icon: 'sort_by_alpha' },
};
const PAGE_SIZES: readonly PageSize[] = [25, 50, 100];

type Pending = { kind: 'role'; user: UserSummary; role: UserRole } | { kind: 'status'; user: UserSummary; status: UserStatus } | { kind: 'bulk-status'; users: UserSummary[]; status: UserStatus };

export function AdminUsers() {
  const { t } = useTranslation();
  const toast = useToast();
  const action = useAction();
  const copyText = useCopy();
  const { user: me } = useAuth();

  // Filters, sort, paging and the open account live in the URL.
  const list = useListParams({ pageSize: 25, pageSizes: PAGE_SIZES, defaults: { status: 'all', role: 'all', sort: 'newest' } });
  const { q, page } = list;
  const pageSize = list.pageSize === 'all' ? 25 : list.pageSize;
  const view = list.oneOf('status', VIEWS);
  const role = list.oneOf('role', ROLES);
  const sort = list.oneOf('sort', Object.keys(SORTS) as SortKey[]);
  const openId = list.get('user') || null;

  // The page of accounts.
  const users = useAsyncData(() => getUsers({ q, role, status: view, page, pageSize, sortBy: SORTS[sort].sortBy, sortOrder: SORTS[sort].sortOrder }), [q, role, view, page, pageSize, sort]);
  const rows = users.data?.items ?? [];
  const total = users.data?.total ?? 0;

  // Everyone at a glance, for the hero.
  const overviewData = useAsyncData<UsersOverview>(async () => {
    const [all, active, disabled, admins] = await Promise.all([getUsers({ pageSize: 5 }), getUsers({ status: 'active', pageSize: 1 }), getUsers({ status: 'disabled', pageSize: 1 }), getUsers({ role: 'admin', pageSize: 1 })]);
    return { total: all.total, active: active.total, disabled: disabled.total, admins: admins.total, newest: all.items };
  }, []);
  const overview = overviewData.data ?? null;

  // Counts on the status switcher follow the search and role; without them they are the overview's.
  const scoped = q !== '' || role !== 'all';
  const scopedCounts = useAsyncData<Record<View, number>>(
    async () => {
      const [all, active, disabled] = await Promise.all(VIEWS.map((status) => getUsers({ q, role, status, pageSize: 1 })));
      return { all: all.total, active: active.total, disabled: disabled.total };
    },
    [q, role],
    { enabled: scoped },
  );
  const counts: Record<View, number> | null = (scoped ? scopedCounts.data : undefined) ?? (overview ? { all: overview.total, active: overview.active, disabled: overview.disabled } : null);

  // The open account.
  const detail = useAsyncData(() => getUserDetail(openId!), [openId], { enabled: openId !== null });
  const shownDetail = detail.data && detail.data.id === openId ? detail.data : null;

  const refresh = () => {
    void users.reload(true);
    void overviewData.reload(true);
    if (scoped) void scopedCounts.reload(true);
    if (openId) void detail.reload(true);
  };

  // Selection covers the accounts in view; it clears whenever the list changes.
  const selection = useSelection(rows, (user) => user.id, [q, role, view, page, pageSize, sort]);
  const selectedUsers = selection.items;

  const [pending, setPending] = useState<Pending | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);

  const copy = (text: string) => void copyText(text, t('v2.users.copied'));

  const changeStorage = async (userId: string, limit: number) => {
    const done = await action.run(
      async () => {
        await updateUserStorageLimit(userId, limit);
        return true;
      },
      { key: userId, success: t('adminUsers.toasts.storageUpdated'), error: t('adminUsers.errors.updateStorage') },
    );
    if (done) refresh();
    return done === true;
  };

  /** Runs one change over several accounts, one at a time, and reports how it went. */
  const runBulk = async (targets: UserSummary[], change: (user: UserSummary) => Promise<void>) => {
    const { done, failed, reason: firstError } = await runEach(targets, change, (user) => user.email);
    if (failed) toast.error(t('v2.users.bulkPartial', { done, failed, reason: firstError }));
    else toast.success(t('v2.users.bulkDone', { count: done }));
    selection.clear();
    refresh();
  };

  const bulkStatus = (status: UserStatus) => {
    const targets = selectedUsers.filter((user) => user.id !== me?.id && user.status !== status);
    if (!targets.length) {
      toast.info(t('v2.users.nothingToChange'));
      return;
    }
    setPending({ kind: 'bulk-status', users: targets, status });
  };

  const bulkStorage = (limit: number) => {
    const targets = selectedUsers.filter((user) => Math.abs((user.storageLimit || 0) - limit) >= 1000);
    if (!targets.length) {
      toast.info(t('v2.users.nothingToChange'));
      return;
    }
    void runBulk(targets, (user) => updateUserStorageLimit(user.id, limit));
  };

  const openUser = (id: string) => list.set({ user: id }, { keepPage: true });
  const closeUser = () => list.set({ user: null }, { keepPage: true, replace: true });

  const tierItems = (current: number | undefined, onSelect: (bytes: number) => void): ActionMenuItem[] =>
    STORAGE_TIERS.map((tier, index) => ({
      key: `tier-${tier.key}`,
      label: t('v2.users.tierLabel', { tier: t(`v2.users.tiers.${tier.key}`), size: formatBytes(tier.bytes) }),
      type: 'radio' as const,
      checked: current !== undefined && tierOf(current) === tier.key,
      divider: index === 0,
      onSelect: () => onSelect(tier.bytes),
    }));

  const rowMenu = (user: UserSummary): ActionMenuItem[] => {
    const self = user.id === me?.id;
    return [
      { key: 'open', icon: 'person_search', label: t('v2.users.open'), onSelect: () => openUser(user.id) },
      { key: 'select', icon: selection.isSelected(user.id) ? 'check_box' : 'check_box_outline_blank', label: t('v2.project.select'), type: 'checkbox', checked: selection.isSelected(user.id), onSelect: () => selection.toggle(user.id) },
      { key: 'copy-email', icon: 'alternate_email', label: t('v2.users.copyEmail'), onSelect: () => copy(user.email) },
      { key: 'copy-id', icon: 'fingerprint', label: t('v2.users.copyId'), onSelect: () => copy(user.id) },
      {
        key: 'role',
        icon: user.role === 'admin' ? 'remove_moderator' : 'add_moderator',
        label: user.role === 'admin' ? t('adminUsers.confirm.demoteTitle') : t('adminUsers.confirm.promoteTitle'),
        disabled: self,
        divider: true,
        onSelect: () => setPending({ kind: 'role', user, role: user.role === 'admin' ? 'user' : 'admin' }),
      },
      { key: 'reset', icon: 'key', label: t('v2.users.resetPassword'), disabled: self, onSelect: () => setResetTarget(user) },
      {
        key: 'status',
        icon: user.status === 'active' ? 'block' : 'check_circle',
        label: user.status === 'active' ? t('v2.users.disable') : t('v2.users.enable'),
        danger: user.status === 'active',
        disabled: self,
        onSelect: () => setPending({ kind: 'status', user, status: user.status === 'active' ? 'disabled' : 'active' }),
      },
      ...tierItems(user.storageLimit, (bytes) => {
        if (tierOf(user.storageLimit) !== tierOf(bytes)) void changeStorage(user.id, bytes);
      }),
    ];
  };

  const nav = (
    <SectionNav<View>
      scope="users"
      label={t('v2.users.sections')}
      value={view}
      onChange={(next) => list.set({ status: next })}
      items={[
        { value: 'all', label: t('v2.users.all'), icon: 'group', count: counts?.all ?? 0 },
        { value: 'active', label: t('adminUsers.active'), icon: 'check_circle', count: counts?.active ?? 0 },
        { value: 'disabled', label: t('adminUsers.disabled'), icon: 'block', count: counts?.disabled ?? 0, signal: (counts?.disabled ?? 0) > 0 ? 'error' : undefined },
      ]}
    />
  );

  const tools = (
    <>
      <ListSearch value={q} onChange={list.setQuery} label={t('adminUsers.searchPlaceholder')} />
      <ActionMenu
        label={t('v2.users.role')}
        icon="filter_list"
        variant={role === 'all' ? 'standard' : 'tonal'}
        openOnHover
        items={ROLES.map((value) => ({
          key: value,
          type: 'radio' as const,
          checked: role === value,
          icon: value === 'admin' ? 'shield_person' : value === 'user' ? 'person' : 'groups',
          label: value === 'all' ? t('v2.users.allRoles') : value === 'admin' ? t('v2.users.admins') : t('v2.users.members'),
          onSelect: () => list.set({ role: value }),
        }))}
      />
      <ActionMenu
        label={t('v2.users.sort')}
        icon="sort"
        openOnHover
        items={(Object.keys(SORTS) as SortKey[]).map((value) => ({
          key: value,
          type: 'radio' as const,
          checked: sort === value,
          icon: SORTS[value].icon,
          label: t(`v2.users.sorts.${value}`),
          onSelect: () => list.set({ sort: value }, { keepPage: true }),
        }))}
      />
    </>
  );

  const chips = (q || role !== 'all') && (
    <>
      {q && <InputChip label={`“${q}”`} icon="search" onRemove={() => list.setQuery('')} removeLabel={t('v2.users.clearSearch')} />}
      {role !== 'all' && <InputChip label={role === 'admin' ? t('v2.users.admins') : t('v2.users.members')} icon={role === 'admin' ? 'shield_person' : 'person'} onRemove={() => list.set({ role: null })} />}
      <Button variant="text" size="xs" onClick={list.clearFilters}>
        {t('v2.common.clearFilters')}
      </Button>
    </>
  );

  const pendingCopy = (() => {
    if (!pending) return null;
    if (pending.kind === 'role') {
      const promote = pending.role === 'admin';
      return {
        tone: 'danger' as const,
        icon: promote ? 'add_moderator' : 'remove_moderator',
        title: promote ? t('adminUsers.confirm.promoteTitle') : t('adminUsers.confirm.demoteTitle'),
        message: t(promote ? 'adminUsers.confirm.promoteMessage' : 'adminUsers.confirm.demoteMessage', { email: pending.user.email }),
      };
    }
    const enable = pending.status === 'active';
    if (pending.kind === 'status') {
      return {
        tone: enable ? ('default' as const) : ('danger' as const),
        icon: enable ? 'check_circle' : 'block',
        title: enable ? t('adminUsers.confirm.enableTitle') : t('adminUsers.confirm.disableTitle'),
        message: t(enable ? 'adminUsers.confirm.enableMessage' : 'adminUsers.confirm.disableMessage', { email: pending.user.email }),
      };
    }
    return {
      tone: enable ? ('default' as const) : ('danger' as const),
      icon: enable ? 'check_circle' : 'block',
      title: t(enable ? 'v2.users.bulkEnableTitle' : 'v2.users.bulkDisableTitle', { count: pending.users.length }),
      message: t(enable ? 'v2.users.bulkEnableMessage' : 'v2.users.bulkDisableMessage', { count: pending.users.length }),
    };
  })();

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === 'bulk-status') {
      const status = pending.status;
      await runBulk(pending.users, (user) => updateUserStatus(user.id, status));
      return;
    }
    const change = pending;
    const done = await action.run(
      async () => {
        if (change.kind === 'role') await updateUserRole(change.user.id, change.role);
        else await updateUserStatus(change.user.id, change.status);
        return true;
      },
      {
        key: change.user.id,
        success: change.kind === 'role' ? t('adminUsers.toasts.roleUpdated') : change.status === 'active' ? t('adminUsers.toasts.userEnabled') : t('adminUsers.toasts.userDisabled'),
        error: t(change.kind === 'role' ? 'adminUsers.errors.updateRole' : 'adminUsers.errors.updateStatus'),
        rethrow: true,
      },
    );
    if (done) refresh();
  };

  return (
    <Page className="v2-users" density="compact">
      <UsersHero
        overview={overview}
        actions={
          <>
            <Button variant="filled" icon="person_add" emphasized onClick={() => setCreateOpen(true)}>
              {t('adminUsers.createUser')}
            </Button>
            <Button variant="tonal" icon="mail" href="/admin/invites">
              {t('adminUsers.inviteUsers')}
            </Button>
          </>
        }
      />

      <ListPane
        label={t('v2.users.title')}
        lead={nav}
        fitKey={view}
        tools={tools}
        below={chips || undefined}
        menuItems={[
          { key: 'invite', icon: 'mail', label: t('adminUsers.inviteUsers'), href: '/admin/invites' },
          { key: 'refresh', icon: 'refresh', label: t('v2.users.refresh'), onSelect: refresh },
        ]}
        loading={users.loading}
        refreshing={users.refreshing}
        error={users.error}
        onRetry={() => void users.reload()}
        count={rows.length}
        filtered={list.filtered}
        onClearFilters={list.clearFilters}
        noMatches={{ icon: 'person_search', title: t('v2.users.noMatches'), description: t('v2.users.noMatchesHint') }}
        empty={{
          icon: 'group',
          title: t('adminUsers.noUsersFound'),
          action: (
            <Button variant="filled" icon="person_add" onClick={() => setCreateOpen(true)}>
              {t('adminUsers.createUser')}
            </Button>
          ),
        }}
        selection={selection}
        selectionActions={[
          { key: 'enable', icon: 'check_circle', label: t('v2.users.enable'), onClick: () => bulkStatus('active') },
          { key: 'storage', icon: 'hard_drive', label: t('v2.users.setStorage'), onClick: () => undefined, menu: tierItems(undefined, bulkStorage).map((item) => ({ ...item, type: 'item' as const, divider: false })) },
          { key: 'disable', icon: 'block', label: t('v2.users.disable'), danger: true, onClick: () => bulkStatus('disabled') },
        ]}
        paging={{ page, pageSize, total, pages: users.data?.pages, onPageChange: list.setPage, onPageSizeChange: list.setPageSize, pageSizes: PAGE_SIZES }}
      >
        <EntityList selecting={selection.selecting} busy={users.refreshing}>
          {rows.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === me?.id}
              selected={selection.isSelected(user.id)}
              selecting={selection.selecting}
              onToggleSelect={(range) => selection.toggle(user.id, range)}
              onOpen={() => openUser(user.id)}
              menuItems={rowMenu(user)}
            />
          ))}
        </EntityList>
      </ListPane>

      <SideSheet open={openId !== null} onClose={closeUser} modal width={600} headline={t('adminUsers.detail.title')}>
        {detail.error ? (
          <ErrorState message={errorText(detail.error, t('adminUsers.errors.loadDetail'))} onRetry={() => void detail.reload()} retryLabel={t('v2.common.retry')} />
        ) : shownDetail ? (
          <UserSheet
            user={shownDetail}
            isSelf={shownDetail.id === me?.id}
            onCopy={copy}
            onToggleStatus={() => setPending({ kind: 'status', user: shownDetail, status: shownDetail.status === 'active' ? 'disabled' : 'active' })}
            onToggleRole={() => setPending({ kind: 'role', user: shownDetail, role: shownDetail.role === 'admin' ? 'user' : 'admin' })}
            onResetPassword={() => setResetTarget(shownDetail)}
            onChangeStorage={(limit) => changeStorage(shownDetail.id, limit)}
          />
        ) : (
          <div className="v2-state">
            <LoadingIndicator contained aria-label={t('projectViewer.common.loading')} />
          </div>
        )}
      </SideSheet>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCopy={copy}
        onCreate={async (data) => {
          const created = await action.run(() => createUser(data), { key: 'create', error: t('adminUsers.errors.createUser') });
          if (!created) return null;
          toast.success(t('adminUsers.toasts.userCreated'), { action: { label: t('v2.users.open'), onClick: () => openUser(created.user.id) } });
          refresh();
          return created.user;
        }}
      />

      <ResetPasswordDialog
        email={resetTarget?.email ?? null}
        onClose={() => setResetTarget(null)}
        onCopy={copy}
        onReset={async (password) => {
          if (!resetTarget) return false;
          const done = await action.run(
            async () => {
              await adminResetUserPassword(resetTarget.id, password);
              return true;
            },
            { key: `reset:${resetTarget.id}`, success: t('adminUsers.toasts.passwordReset'), error: t('adminUsers.errors.resetPassword') },
          );
          return done === true;
        }}
      />

      <ConfirmDialog open={pending !== null} tone={pendingCopy?.tone} icon={pendingCopy?.icon} title={pendingCopy?.title ?? ''} message={pendingCopy?.message} confirmLabel={pendingCopy?.title} onClose={() => setPending(null)} onConfirm={confirmPending} />
    </Page>
  );
}
