import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { adminResetUserPassword, createUser, getUserDetail, getUsers, updateUserRole, updateUserStatus, updateUserStorageLimit } from '../../api';
import { Button, IconButton, InputChip, LoadingIndicator, Select, SideSheet, Text, useSnackbar } from '../../m3';
import type { UserDetail, UserRole, UserStatus, UserSummary } from '../../types';
import { useAuth } from '../app/auth';
import { DangerAction, ResultsBar, SectionNav } from '../components/project/ResultsBar';
import { CreateUserDialog, ResetPasswordDialog } from '../components/users/UserDialogs';
import { UserRow } from '../components/users/UserRow';
import { UserSheet } from '../components/users/UserSheet';
import { UsersHero, type UsersOverview } from '../components/users/UsersHero';
import { STORAGE_TIERS, tierOf } from '../components/users/userMeta';
import { formatBytes } from '../lib/format';
import { useRangeSelection } from '../lib/useRangeSelection';
import { ActionMenu, type ActionMenuItem } from '../ui/ActionMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EntityList } from '../ui/EntityList';
import { EmptyState, ErrorState, LoadingState, Page } from '../ui/Page';
import { Pagination } from '../ui/Pagination';
import { SearchField } from '../ui/SearchField';

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
const PAGE_SIZES = [25, 50, 100];

type Pending = { kind: 'role'; user: UserSummary; role: UserRole } | { kind: 'status'; user: UserSummary; status: UserStatus } | { kind: 'bulk-status'; users: UserSummary[]; status: UserStatus };

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function AdminUsers() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();

  // Filters, sort, paging and the open account live in the URL.
  const q = params.get('q') ?? '';
  const view = pick(params.get('status'), VIEWS, 'all');
  const role = pick(params.get('role'), ROLES, 'all');
  const sort = pick(params.get('sort'), Object.keys(SORTS) as SortKey[], 'newest');
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : PAGE_SIZES[0];
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const openId = params.get('user');

  const update = useCallback(
    (patch: Record<string, string | number | null>, { push = false }: { push?: boolean } = {}) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '' || value === 'all') next.delete(key);
            else next.set(key, String(value));
          }
          // Any change to what is listed starts again from the first page.
          if (!('page' in patch) && !('user' in patch)) next.delete('page');
          if (next.get('page') === '1') next.delete('page');
          if (next.get('sort') === 'newest') next.delete('sort');
          if (next.get('size') === String(PAGE_SIZES[0])) next.delete('size');
          return next;
        },
        { replace: !push },
      );
    },
    [setParams],
  );

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]);
  useEffect(() => {
    const value = searchInput.trim();
    if (value === q) return;
    const timer = window.setTimeout(() => update({ q: value }), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, q, update]);

  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  // The page of accounts.
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const listRequest = useRef(0);
  useEffect(() => {
    const id = ++listRequest.current;
    setLoading(true);
    getUsers({ q, role, status: view, page, pageSize, sortBy: SORTS[sort].sortBy, sortOrder: SORTS[sort].sortOrder })
      .then((result) => {
        if (id !== listRequest.current) return;
        setUsers(result.items);
        setTotal(result.total);
        setPages(result.pages);
        setError('');
      })
      .catch((err: Error) => id === listRequest.current && setError(err.message || t('adminUsers.errors.loadUsers')))
      .finally(() => {
        if (id !== listRequest.current) return;
        setLoading(false);
        setLoaded(true);
      });
  }, [q, role, view, page, pageSize, sort, reloadKey, t]);

  // Everyone at a glance, for the hero.
  const [overview, setOverview] = useState<UsersOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers({ pageSize: 5 }), getUsers({ status: 'active', pageSize: 1 }), getUsers({ status: 'disabled', pageSize: 1 }), getUsers({ role: 'admin', pageSize: 1 })])
      .then(([all, active, disabled, admins]) => {
        if (!cancelled) setOverview({ total: all.total, active: active.total, disabled: disabled.total, admins: admins.total, newest: all.items });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Counts on the status switcher follow the search and role; without them they are the overview's.
  const [scopedCounts, setScopedCounts] = useState<Record<View, number> | null>(null);
  useEffect(() => {
    if (!q && role === 'all') {
      setScopedCounts(null);
      return;
    }
    let cancelled = false;
    Promise.all(VIEWS.map((status) => getUsers({ q, role, status, pageSize: 1 })))
      .then(([all, active, disabled]) => {
        if (!cancelled) setScopedCounts({ all: all.total, active: active.total, disabled: disabled.total });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [q, role, reloadKey]);
  const counts: Record<View, number> | null = scopedCounts ?? (overview ? { all: overview.total, active: overview.active, disabled: overview.disabled } : null);

  // The open account.
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailError, setDetailError] = useState('');
  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    let cancelled = false;
    setDetailError('');
    getUserDetail(openId)
      .then((result) => !cancelled && setDetail(result))
      .catch((err: Error) => !cancelled && setDetailError(err.message || t('adminUsers.errors.loadDetail')));
    return () => {
      cancelled = true;
    };
  }, [openId, reloadKey, t]);
  const shownDetail = detail && detail.id === openId ? detail : null;

  // Selection covers the accounts in view; it clears whenever the list changes.
  const { selected, toggle, selectAll, clear: clearSelection } = useRangeSelection(users, (user) => user.id, [q, role, view, page, pageSize, sort]);
  const selectedUsers = useMemo(() => users.filter((user) => selected.has(user.id)), [users, selected]);

  const [pending, setPending] = useState<Pending | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);

  const fail = (err: unknown, key: string) => snackbar.show((err as Error).message || t(key));

  const copy = (text: string) => {
    void navigator.clipboard
      .writeText(text)
      .then(() => snackbar.show(t('v2.users.copied')))
      .catch(() => snackbar.show(t('v2.users.copyFailed')));
  };

  const changeStorage = async (userId: string, limit: number) => {
    try {
      await updateUserStorageLimit(userId, limit);
      snackbar.show(t('adminUsers.toasts.storageUpdated'));
      refresh();
      return true;
    } catch (err) {
      fail(err, 'adminUsers.errors.updateStorage');
      return false;
    }
  };

  /** Runs one change over several accounts, one at a time, and reports how it went. */
  const runBulk = async (targets: UserSummary[], change: (user: UserSummary) => Promise<void>) => {
    let done = 0;
    let firstError = '';
    for (const user of targets) {
      try {
        await change(user);
        done += 1;
      } catch (err) {
        firstError ||= `${user.email}: ${(err as Error).message}`;
      }
    }
    const failed = targets.length - done;
    snackbar.show(failed ? t('v2.users.bulkPartial', { done, failed, reason: firstError }) : t('v2.users.bulkDone', { count: done }));
    clearSelection();
    refresh();
  };

  const bulkStatus = (status: UserStatus) => {
    const targets = selectedUsers.filter((user) => user.id !== me?.id && user.status !== status);
    if (!targets.length) {
      snackbar.show(t('v2.users.nothingToChange'));
      return;
    }
    setPending({ kind: 'bulk-status', users: targets, status });
  };

  const bulkStorage = (limit: number) => {
    const targets = selectedUsers.filter((user) => Math.abs((user.storageLimit || 0) - limit) >= 1000);
    if (!targets.length) {
      snackbar.show(t('v2.users.nothingToChange'));
      return;
    }
    void runBulk(targets, (user) => updateUserStorageLimit(user.id, limit));
  };

  const openUser = (id: string) => update({ user: id }, { push: true });
  const closeUser = () => update({ user: null });

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
      { key: 'select', icon: selected.has(user.id) ? 'check_box' : 'check_box_outline_blank', label: t('v2.project.select'), type: 'checkbox', checked: selected.has(user.id), onSelect: () => toggle(user.id, false) },
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

  const filtered = Boolean(q) || role !== 'all' || view !== 'all';
  const clearFilters = () => {
    setSearchInput('');
    update({ q: null, role: null, status: null });
  };
  const rangeStart = total ? (Math.min(page, pages) - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(total, rangeStart + users.length - 1);

  const nav = (
    <SectionNav<View>
      scope="users"
      label={t('v2.users.sections')}
      value={view}
      onChange={(next) => update({ status: next })}
      items={[
        { value: 'all', label: t('v2.users.all'), icon: 'group', count: counts?.all ?? 0 },
        { value: 'active', label: t('adminUsers.active'), icon: 'check_circle', count: counts?.active ?? 0 },
        { value: 'disabled', label: t('adminUsers.disabled'), icon: 'block', count: counts?.disabled ?? 0, signal: (counts?.disabled ?? 0) > 0 ? 'error' : undefined },
      ]}
    />
  );

  const tools = (
    <>
      <SearchField value={searchInput} onChange={setSearchInput} onSubmit={(value) => update({ q: value.trim() })} placeholder={t('adminUsers.searchPlaceholder')} className="v2-users-search" />
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
          onSelect: () => update({ role: value }),
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
          onSelect: () => update({ sort: value }),
        }))}
      />
    </>
  );

  const chips = (q || role !== 'all') && (
    <>
      {q && <InputChip label={`“${q}”`} icon="search" onRemove={() => update({ q: null })} removeLabel={t('v2.users.clearSearch')} />}
      {role !== 'all' && <InputChip label={role === 'admin' ? t('v2.users.admins') : t('v2.users.members')} icon={role === 'admin' ? 'shield_person' : 'person'} onRemove={() => update({ role: null })} />}
      <Button variant="text" size="xs" onClick={clearFilters}>
        {t('v2.project.clearFilters')}
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
    try {
      if (pending.kind === 'role') {
        await updateUserRole(pending.user.id, pending.role);
        snackbar.show(t('adminUsers.toasts.roleUpdated'));
      } else {
        await updateUserStatus(pending.user.id, pending.status);
        snackbar.show(pending.status === 'active' ? t('adminUsers.toasts.userEnabled') : t('adminUsers.toasts.userDisabled'));
      }
      refresh();
    } catch (err) {
      fail(err, pending.kind === 'role' ? 'adminUsers.errors.updateRole' : 'adminUsers.errors.updateStatus');
    }
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

      <section className="v2-users-pane" aria-label={t('v2.users.title')}>
        <ResultsBar
          nav={nav}
          totalCount={users.length}
          selectedCount={selectedUsers.length}
          onToggleSelectAll={selectAll}
          onClearSelection={clearSelection}
          isLoading={loading && loaded}
          tools={tools}
          below={chips || undefined}
          menuItems={[
            { key: 'invite', icon: 'mail', label: t('adminUsers.inviteUsers'), href: '/admin/invites' },
            { key: 'refresh', icon: 'refresh', label: t('v2.users.refresh'), onSelect: refresh },
          ]}
          selectionActions={
            <>
              <IconButton icon="check_circle" size="sm" label={t('v2.users.enable')} tooltip onClick={() => bulkStatus('active')} />
              <ActionMenu label={t('v2.users.setStorage')} icon="hard_drive" openOnHover items={tierItems(undefined, bulkStorage).map((item) => ({ ...item, type: 'item' as const, divider: false }))} />
              <DangerAction icon="block" label={t('v2.users.disable')} onClick={() => bulkStatus('disabled')} />
            </>
          }
        />

        {error && (
          <div className="v2-pane-inset">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        )}

        {!loaded ? (
          <LoadingState />
        ) : users.length === 0 && !error ? (
          <EmptyState
            className="v2-pane-empty"
            shape={filtered ? 'puffy' : 'cookie-9'}
            icon={filtered ? 'person_search' : 'group'}
            title={filtered ? t('v2.users.noMatches') : t('adminUsers.noUsersFound')}
            description={filtered ? t('v2.users.noMatchesHint') : t('adminUsers.adjustFilters')}
            action={
              filtered ? (
                <Button variant="tonal" icon="filter_alt_off" onClick={clearFilters}>
                  {t('v2.project.clearFilters')}
                </Button>
              ) : (
                <Button variant="filled" icon="person_add" onClick={() => setCreateOpen(true)}>
                  {t('adminUsers.createUser')}
                </Button>
              )
            }
          />
        ) : (
          <EntityList selecting={selected.size > 0} busy={loading}>
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSelf={user.id === me?.id}
                selected={selected.has(user.id)}
                selecting={selected.size > 0}
                onToggleSelect={(range) => toggle(user.id, range)}
                onOpen={() => openUser(user.id)}
                menuItems={rowMenu(user)}
              />
            ))}
          </EntityList>
        )}

        {loaded && total > 0 && (
          <footer className="v2-users-footer" data-density="compact">
            <Text variant="label-medium" className="text-on-surface-variant">
              {t('pagination.range', { start: rangeStart, end: rangeEnd, total })}
            </Text>
            <div className="v2-users-footer__paging">
              <Select
                variant="outlined"
                aria-label={t('pagination.pageSize')}
                value={String(pageSize)}
                onChange={(size) => update({ size: Number(size) })}
                options={PAGE_SIZES.map((size) => ({ value: String(size), label: t('adminUsers.pageSize', { count: size }) }))}
                className="v2-inline-select v2-page-size"
              />
              {pages > 1 && <Pagination page={Math.min(page, pages)} pages={pages} onPageChange={(next) => update({ page: next })} scrollToTop={false} />}
            </div>
          </footer>
        )}
      </section>

      <SideSheet open={openId !== null} onClose={closeUser} modal width={600} headline={t('adminUsers.detail.title')}>
        {detailError ? (
          <ErrorState message={detailError} onRetry={refresh} />
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
          <div className="v2-results-loading">
            <LoadingIndicator contained aria-label={t('projectViewer.common.loading')} />
          </div>
        )}
      </SideSheet>

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCopy={copy}
        onCreate={async (data) => {
          try {
            const { user } = await createUser(data);
            snackbar.show({ message: t('adminUsers.toasts.userCreated'), action: { label: t('v2.users.open'), onClick: () => openUser(user.id) } });
            refresh();
            return user;
          } catch (err) {
            fail(err, 'adminUsers.errors.createUser');
            return null;
          }
        }}
      />

      <ResetPasswordDialog
        email={resetTarget?.email ?? null}
        onClose={() => setResetTarget(null)}
        onCopy={copy}
        onReset={async (password) => {
          if (!resetTarget) return false;
          try {
            await adminResetUserPassword(resetTarget.id, password);
            snackbar.show(t('adminUsers.toasts.passwordReset'));
            return true;
          } catch (err) {
            fail(err, 'adminUsers.errors.resetPassword');
            return false;
          }
        }}
      />

      <ConfirmDialog open={pending !== null} tone={pendingCopy?.tone} icon={pendingCopy?.icon} title={pendingCopy?.title ?? ''} message={pendingCopy?.message} confirmLabel={pendingCopy?.title} onClose={() => setPending(null)} onConfirm={confirmPending} />
    </Page>
  );
}
