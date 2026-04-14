import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, HardDrive, KeyRound, Loader2, Mail, Search, Shield, UserPlus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { adminResetUserPassword, createUser, getUserDetail, getUsers, updateUserRole, updateUserStatus, updateUserStorageLimit } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { UserDetail, UserRole, UserStatus, UserSummary } from '../types';
import { PageHeader } from '../components/PageHeader';
import { toast } from 'sonner';

type UserFilters = {
  q: string;
  role: UserRole | 'all';
  status: UserStatus | 'all';
  page: number;
  pageSize: number;
};

const initialFilters: UserFilters = {
  q: '',
  role: 'all',
  status: 'all',
  page: 1,
  pageSize: 20,
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusBadgeClass(status: UserStatus) {
  return status === 'active'
    ? 'border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-sm'
    : 'border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 shadow-sm';
}

function roleBadgeClass(role: UserRole) {
  return role === 'admin'
    ? 'border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 shadow-sm'
    : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 shadow-sm';
}

export function AdminUsers() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const STORAGE_TIERS = useMemo(() => [
    { name: 'Free (5GB)', value: 5 * 1024 * 1024 * 1024 },
    { name: 'Professional (100GB)', value: 100 * 1024 * 1024 * 1024 },
    { name: 'Premium (500GB)', value: 500 * 1024 * 1024 * 1024 },
  ], []);

  const [filters, setFilters] = useState<UserFilters>(initialFilters);
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    role: 'user' as UserRole,
    status: 'disabled' as UserStatus,
    storageLimit: STORAGE_TIERS[0].value,
  });
  const [resetPassword, setResetPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ userId: string; status: UserStatus; email: string } | null>(null);

  const formatDate = (value?: number) => {
    if (!value) return t('adminUsers.never');
    return new Date(value).toLocaleString();
  };

  const formatRelativeDate = (value?: number) => {
    if (!value) return t('adminUsers.never');
    const diffMs = Date.now() - value;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return t('adminUsers.justNow');
    if (diffMin < 60) return t('adminUsers.relativeTime.m', { count: diffMin });
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return t('adminUsers.relativeTime.h', { count: diffHr });
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 30) return t('adminUsers.relativeTime.d', { count: diffDay });
    return new Date(value).toLocaleDateString();
  };

  const storageTierName = (limit?: number) => {
    const matched = STORAGE_TIERS.find((tier) => Math.abs(tier.value - (limit || 0)) < 1000);
    return matched?.name || 'Custom';
  };

  const canResetPassword = useMemo(
    () => activeUser && currentUser && activeUser.id !== currentUser.id,
    [activeUser, currentUser]
  );

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getUsers(filters);
      setUsers(result.items);
      setTotal(result.total);
      setPages(result.pages);
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.loadUsers'));
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetailError('');
    try {
      const detail = await getUserDetail(userId);
      setActiveUser(detail);
      setResetPassword('');
    } catch (err: any) {
      setDetailError(err.message || t('adminUsers.errors.loadDetail'));
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => ({ ...current, q: searchInput.trim(), page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!activeUserId) {
      setActiveUser(null);
      setDetailError('');
      return;
    }
    void loadDetail(activeUserId);
  }, [activeUserId]);

  const refreshAll = async (userId?: string) => {
    await loadUsers();
    if (userId || activeUserId) {
      await loadDetail(userId || activeUserId!);
    }
  };


  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success(t('adminUsers.toasts.roleUpdated'));
      await refreshAll(userId);
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.updateRole'));
      toast.error(err.message || t('adminUsers.errors.updateRole'));
    }
  };

  const handleStorageLimitChange = async (userId: string, newLimit: number) => {
    try {
      await updateUserStorageLimit(userId, newLimit);
      toast.success(t('adminUsers.toasts.storageUpdated'));
      await refreshAll(userId);
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.updateStorage'));
      toast.error(err.message || t('adminUsers.errors.updateStorage'));
    }
  };

  const handleStatusChange = async () => {
    if (!pendingStatusChange) return;
    try {
      await updateUserStatus(pendingStatusChange.userId, pendingStatusChange.status);
      toast.success(pendingStatusChange.status === 'active' ? t('adminUsers.toasts.userEnabled') : t('adminUsers.toasts.userDisabled'));
      await refreshAll(pendingStatusChange.userId);
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.updateStatus'));
      toast.error(err.message || t('adminUsers.errors.updateStatus'));
    } finally {
      setPendingStatusChange(null);
    }
  };

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    setCreateLoading(true);
    setError('');
    try {
      await createUser(createForm);
      toast.success(t('adminUsers.toasts.userCreated'));
      setIsCreateOpen(false);
      setCreateForm({
        email: '',
        password: '',
        role: 'user',
        status: 'disabled',
        storageLimit: STORAGE_TIERS[0].value,
      });
      setFilters((current) => ({ ...current, page: 1 }));
      await loadUsers();
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.createUser'));
      toast.error(err.message || t('adminUsers.errors.createUser'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeUser) return;

    setResettingPassword(true);
    try {
      await adminResetUserPassword(activeUser.id, resetPassword);
      toast.success(t('adminUsers.toasts.passwordReset'));
      setResetPassword('');
      await loadDetail(activeUser.id);
    } catch (err: any) {
      setError(err.message || t('adminUsers.errors.resetPassword'));
      toast.error(err.message || t('adminUsers.errors.resetPassword'));
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="w-full space-y-8">
        <PageHeader
          title={t('adminUsers.title')}
          description={t('adminUsers.description')}
          actions={(
            <>
              <Link
                to="/admin/invites"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-600 dark:bg-emerald-500/15 px-5 py-3 text-sm font-black text-white dark:text-emerald-200 transition hover:bg-emerald-700 dark:hover:bg-emerald-500/25 shrink-0 shadow-lg shadow-emerald-600/10 active:scale-95 uppercase tracking-widest"
              >
                <Mail className="h-4 w-4" />
                {t('adminUsers.inviteUsers')}
              </Link>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-600 dark:bg-blue-500/15 px-5 py-3 text-sm font-black text-white dark:text-blue-200 transition hover:bg-blue-700 dark:hover:bg-blue-500/25 shrink-0 shadow-lg shadow-blue-600/10 active:scale-95 uppercase tracking-widest"
              >
                <UserPlus className="h-4 w-4" />
                {t('adminUsers.createUser')}
              </button>
            </>
          )}
        />

        <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 overflow-hidden shadow-sm backdrop-blur-xl">
          <form onSubmit={(e) => e.preventDefault()} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
            <label className="flex items-center gap-3 border-r border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-950/40 px-6 py-4">
              <Search className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('adminUsers.searchPlaceholder')}
                className="w-full bg-transparent text-sm font-medium text-neutral-900 dark:text-neutral-100 outline-none placeholder:text-neutral-500"
              />
            </label>

            <select
              value={filters.role}
              onChange={(e) => setFilters((current) => ({ ...current, role: e.target.value as UserRole | 'all', page: 1 }))}
              className="border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-4 text-sm font-bold text-neutral-900 dark:text-neutral-200 outline-none appearance-none cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              <option value="all">{t('adminUsers.allRoles')}</option>
              <option value="admin">{t('adminUsers.admin')}</option>
              <option value="user">{t('adminUsers.user')}</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as UserStatus | 'all', page: 1 }))}
              className="border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-4 text-sm font-bold text-neutral-900 dark:text-neutral-200 outline-none appearance-none cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              <option value="all">{t('adminUsers.allStatuses')}</option>
              <option value="active">{t('adminUsers.active')}</option>
              <option value="disabled">{t('adminUsers.disabled')}</option>
            </select>

          </form>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 shadow-sm backdrop-blur-xl">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Users className="h-10 w-10 text-neutral-700" />
              <div>
                <p className="text-lg font-medium text-neutral-700 dark:text-neutral-300">{t('adminUsers.noUsersFound')}</p>
                <p className="text-sm text-neutral-500 dark:text-neutral-500">{t('adminUsers.adjustFilters')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden xl:grid xl:grid-cols-[minmax(240px,1.5fr)_110px_110px_170px_100px_100px_160px_120px] gap-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/70 px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
                <span>{t('adminUsers.table.user')}</span>
                <span>{t('adminUsers.table.role')}</span>
                <span>{t('adminUsers.table.status')}</span>
                <span>{t('adminUsers.table.storage')}</span>
                <span>{t('adminUsers.table.projects')}</span>
                <span>{t('adminUsers.table.libraries')}</span>
                <span>{t('adminUsers.table.lastLogin')}</span>
                <span>{t('adminUsers.table.actions')}</span>
              </div>
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {users.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setActiveUserId(user.id)}
                    className="grid cursor-pointer gap-4 px-6 py-5 text-left transition hover:bg-neutral-50 dark:hover:bg-neutral-800/30 xl:grid-cols-[minmax(240px,1.5fr)_110px_110px_170px_100px_100px_160px_120px] group/row"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">{user.email}</p>
                          <p className="truncate text-xs text-neutral-500 dark:text-neutral-500">{user.id}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center xl:items-start">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${roleBadgeClass(user.role)}`}>
                        {user.role}
                      </span>
                    </div>

                    <div className="flex items-center xl:items-start">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(user.status)}`}>
                        {user.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-neutral-900 dark:text-neutral-200">{formatBytes(user.usedStorage)} / {formatBytes(user.storageLimit || 0)}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">{storageTierName(user.storageLimit)}</p>
                    </div>

                    <div className="text-sm text-neutral-700 dark:text-neutral-300">{user.projectCount}</div>
                    <div className="text-sm text-neutral-700 dark:text-neutral-300">{user.libraryCount}</div>
                    <div className="space-y-1">
                      <p className="text-sm text-neutral-700 dark:text-neutral-300">{formatRelativeDate(user.lastLoginAt)}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : t('adminUsers.neverSignedIn')}</p>
                    </div>

                    <div className="flex items-center justify-start gap-2" onClick={(event) => event.stopPropagation()}>
                      <select
                        value={user.role}
                        disabled={user.id === currentUser?.id}
                        onChange={(e) => void handleRoleChange(user.id, e.target.value as UserRole)}
                        className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-xs text-neutral-900 dark:text-neutral-200 font-bold outline-none disabled:opacity-50 transition-all focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="user">{t('adminUsers.user')}</option>
                        <option value="admin">{t('adminUsers.admin')}</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="flex flex-col gap-3 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-4 md:flex-row md:items-center md:justify-between shadow-sm">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            {total > 0 ? t('adminUsers.showingUsers', { count: users.length, total }) : t('adminUsers.noUsersToShow')}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filters.pageSize}
              onChange={(e) => setFilters((current) => ({ ...current, pageSize: Number(e.target.value), page: 1 }))}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-200 outline-none font-bold"
            >
              <option value={20}>{t('adminUsers.pageSize', { count: 20 })}</option>
              <option value={50}>{t('adminUsers.pageSize', { count: 50 })}</option>
              <option value={100}>{t('adminUsers.pageSize', { count: 100 })}</option>
            </select>
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-2 text-neutral-700 dark:text-neutral-300 transition hover:bg-white dark:hover:bg-neutral-800 hover:shadow-sm disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.pagination', { current: filters.page, total: pages })}</span>
            <button
              type="button"
              disabled={filters.page >= pages}
              onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, current.page + 1) }))}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-2 text-neutral-700 dark:text-neutral-300 transition hover:bg-white dark:hover:bg-neutral-800 hover:shadow-sm disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 dark:bg-black/60 p-6 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-[28px] border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">{t('adminUsers.createModal.title')}</h3>
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">{t('adminUsers.createModal.description')}</p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-2 text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.createModal.email')}</span>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.createModal.password')} <span className="text-neutral-600">{t('adminUsers.createModal.optional')}</span></span>
                <input
                  type="password"
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((current) => ({ ...current, password: e.target.value }))}
                  placeholder={t('adminUsers.createModal.passwordPlaceholder')}
                  className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.createModal.role')}</span>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((current) => ({ ...current, role: e.target.value as UserRole }))}
                    className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none"
                  >
                    <option value="user">{t('adminUsers.user')}</option>
                    <option value="admin">{t('adminUsers.admin')}</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.createModal.status')}</span>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm((current) => ({ ...current, status: e.target.value as UserStatus }))}
                    className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none"
                  >
                    <option value="active">{t('adminUsers.active')}</option>
                    <option value="disabled">{t('adminUsers.disabled')}</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.createModal.storage')}</span>
                  <select
                    value={createForm.storageLimit}
                    onChange={(e) => setCreateForm((current) => ({ ...current, storageLimit: Number(e.target.value) }))}
                    className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none"
                  >
                    {STORAGE_TIERS.map((tier) => (
                      <option key={tier.value} value={tier.value}>{tier.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-neutral-200 dark:border-neutral-800 pt-4">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-2xl px-4 py-3 text-sm text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                  {t('adminUsers.createModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/25 disabled:opacity-60"
                >
                  {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  {t('adminUsers.createModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeUserId && (
        <div className="fixed inset-0 z-[85] bg-black/20 dark:bg-black/40 backdrop-blur-md">
          <div className="absolute inset-y-0 right-0 flex w-full justify-end">
            <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-neutral-200/50 dark:border-white/5 bg-white/80 dark:bg-neutral-950/80 shadow-2xl backdrop-blur-3xl">
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 px-6 py-5">
                <div>
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">{t('adminUsers.detail.title')}</h3>
                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.description')}</p>
                </div>
                <button type="button" onClick={() => setActiveUserId(null)} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-2 text-neutral-600 dark:text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                </div>
              ) : detailError ? (
                <div className="m-6 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <span>{detailError}</span>
                </div>
              ) : activeUser ? (
                <div className="space-y-6 p-6">
                  <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.account')}</p>
                        <h4 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">{activeUser.email}</h4>
                        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-500">{activeUser.id}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${roleBadgeClass(activeUser.role)}`}>{activeUser.role}</span>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(activeUser.status)}`}>{activeUser.status}</span>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <Stat label={t('adminUsers.detail.created')} value={formatDate(activeUser.createdAt)} icon={<Clock3 className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.lastLogin')} value={formatDate(activeUser.lastLoginAt)} icon={<CheckCircle2 className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.storageTier')} value={storageTierName(activeUser.storageLimit)} icon={<HardDrive className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.usedLimit')} value={`${formatBytes(activeUser.usedStorage)} / ${formatBytes(activeUser.storageLimit || 0)}`} icon={<Shield className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.createdBy')} value={activeUser.createdBy?.email || t('adminUsers.detail.selfRegistered')} icon={<Users className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.inviteCode')} value={activeUser.inviteCode?.code || t('adminUsers.detail.notInviteBased')} icon={<Mail className="h-4 w-4" />} />
                      <Stat label={t('adminUsers.detail.inviteNote')} value={activeUser.inviteCode?.note || t('adminUsers.detail.noNote')} icon={<Mail className="h-4 w-4" />} />
                    </div>
                  </section>

                  <section className="grid gap-4 md:grid-cols-4">
                    <MiniCard label={t('adminUsers.detail.projects')} value={activeUser.projectCount} />
                    <MiniCard label={t('adminUsers.detail.libraries')} value={activeUser.libraryCount} />
                    <MiniCard label={t('adminUsers.detail.providers')} value={activeUser.providerCount} />
                    <MiniCard label={t('adminUsers.detail.exports')} value={activeUser.exportCount} />
                  </section>

                  <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.storageBreakdown')}</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <StorageRow label={t('adminUsers.detail.projects')} value={activeUser.storageBreakdown.projects} />
                      <StorageRow label={t('adminUsers.detail.libraries')} value={activeUser.storageBreakdown.libraries} />
                      <StorageRow label={t('adminUsers.detail.exports')} value={activeUser.storageBreakdown.exports} />
                      <StorageRow label={t('adminUsers.detail.trash')} value={activeUser.storageBreakdown.trash} />
                    </div>
                  </section>

                  <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.adminControls')}</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.table.role')}</span>
                        <select
                          value={activeUser.role}
                          disabled={activeUser.id === currentUser?.id}
                          onChange={(e) => void handleRoleChange(activeUser.id, e.target.value as UserRole)}
                          className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none disabled:opacity-50"
                        >
                          <option value="user">{t('adminUsers.user')}</option>
                          <option value="admin">{t('adminUsers.admin')}</option>
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.detail.limit')}</span>
                        <select
                          value={activeUser.storageLimit || STORAGE_TIERS[0].value}
                          onChange={(e) => void handleStorageLimitChange(activeUser.id, Number(e.target.value))}
                          className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none"
                        >
                          {STORAGE_TIERS.map((tier) => (
                            <option key={tier.value} value={tier.value}>{tier.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={activeUser.id === currentUser?.id}
                        onClick={() => setPendingStatusChange({
                          userId: activeUser.id,
                          status: activeUser.status === 'active' ? 'disabled' : 'active',
                          email: activeUser.email,
                        })}
                        className={`rounded-2xl px-4 py-3 text-sm font-medium transition disabled:opacity-50 ${
                          activeUser.status === 'active'
                            ? 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20'
                            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                        }`}
                      >
                        {activeUser.status === 'active' ? t('adminUsers.detail.disableUser') : t('adminUsers.detail.enableUser')}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-6 shadow-sm">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.passwordReset')}</p>
                    </div>
                    {canResetPassword ? (
                      <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('adminUsers.detail.newPassword')}</span>
                          <input
                            type="password"
                            minLength={8}
                            required
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100 font-bold outline-none shadow-sm"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={resettingPassword}
                          className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/25 disabled:opacity-60"
                        >
                          {resettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          {t('adminUsers.detail.resetSubmit')}
                        </button>
                      </form>
                    ) : (
                      <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-500">{t('adminUsers.detail.ownPasswordNote')}</p>
                    )}
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={pendingStatusChange !== null}
        onClose={() => setPendingStatusChange(null)}
        onConfirm={handleStatusChange}
        title={pendingStatusChange?.status === 'active' ? t('adminUsers.confirm.enableTitle') : t('adminUsers.confirm.disableTitle')}
        message={pendingStatusChange ? (pendingStatusChange.status === 'active' ? t('adminUsers.confirm.enableMessage', { email: pendingStatusChange.email }) : t('adminUsers.confirm.disableMessage', { email: pendingStatusChange.email })) : ''}
        confirmText={pendingStatusChange?.status === 'active' ? t('adminUsers.confirm.enableTitle') : t('adminUsers.confirm.disableTitle')}
        type={pendingStatusChange?.status === 'active' ? 'info' : 'danger'}
      />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/70 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 text-sm text-neutral-900 dark:text-neutral-200">{value}</p>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function StorageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/70 px-4 py-3">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{formatBytes(value)}</span>
    </div>
  );
}
