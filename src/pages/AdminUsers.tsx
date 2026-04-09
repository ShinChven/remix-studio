import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Filter, HardDrive, KeyRound, Loader2, Mail, Search, Shield, UserPlus, Users, X } from 'lucide-react';
import { adminResetUserPassword, createUser, getUserDetail, getUsers, updateUserRole, updateUserStatus, updateUserStorageLimit } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { UserDetail, UserRole, UserStatus, UserSummary } from '../types';
import { toast } from 'sonner';

const STORAGE_TIERS = [
  { name: 'Free (5GB)', value: 5 * 1024 * 1024 * 1024 },
  { name: 'Professional (100GB)', value: 100 * 1024 * 1024 * 1024 },
  { name: 'Premium (500GB)', value: 500 * 1024 * 1024 * 1024 },
];

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

function formatDate(value?: number) {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

function formatRelativeDate(value?: number) {
  if (!value) return 'Never';
  const diffMs = Date.now() - value;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(value).toLocaleDateString();
}

function storageTierName(limit?: number) {
  const matched = STORAGE_TIERS.find((tier) => Math.abs(tier.value - (limit || 0)) < 1000);
  return matched?.name || 'Custom';
}

function statusBadgeClass(status: UserStatus) {
  return status === 'active'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    : 'border-red-500/20 bg-red-500/10 text-red-300';
}

function roleBadgeClass(role: UserRole) {
  return role === 'admin'
    ? 'border-amber-500/20 bg-amber-500/10 text-amber-300'
    : 'border-neutral-700 bg-neutral-800 text-neutral-300';
}

export function AdminUsers() {
  const { user: currentUser } = useAuth();
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
      setError(err.message || 'Failed to load users');
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
      setDetailError(err.message || 'Failed to load user detail');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [filters]);

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

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: searchInput.trim(), page: 1 }));
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      await updateUserRole(userId, newRole);
      toast.success('Role updated');
      await refreshAll(userId);
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
      toast.error(err.message || 'Failed to update role');
    }
  };

  const handleStorageLimitChange = async (userId: string, newLimit: number) => {
    try {
      await updateUserStorageLimit(userId, newLimit);
      toast.success('Storage limit updated');
      await refreshAll(userId);
    } catch (err: any) {
      setError(err.message || 'Failed to update storage limit');
      toast.error(err.message || 'Failed to update storage limit');
    }
  };

  const handleStatusChange = async () => {
    if (!pendingStatusChange) return;
    try {
      await updateUserStatus(pendingStatusChange.userId, pendingStatusChange.status);
      toast.success(`User ${pendingStatusChange.status === 'active' ? 'enabled' : 'disabled'}`);
      await refreshAll(pendingStatusChange.userId);
    } catch (err: any) {
      setError(err.message || 'Failed to update user status');
      toast.error(err.message || 'Failed to update user status');
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
      toast.success('User created');
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
      setError(err.message || 'Failed to create user');
      toast.error(err.message || 'Failed to create user');
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
      toast.success('Password reset');
      setResetPassword('');
      await loadDetail(activeUser.id);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div className="p-6 lg:p-10">
      <div className="w-full space-y-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 font-display">User Management</h2>
            <p className="text-sm md:text-base text-neutral-400">Create users, control access, and inspect account usage without external systems.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/25"
          >
            <UserPlus className="h-4 w-4" />
            Create User
          </button>
        </header>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-4">
          <form onSubmit={handleFilterSubmit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_120px]">
            <label className="flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
              <Search className="h-4 w-4 text-neutral-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by email"
                className="w-full bg-transparent text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
              />
            </label>

            <select
              value={filters.role}
              onChange={(e) => setFilters((current) => ({ ...current, role: e.target.value as UserRole | 'all', page: 1 }))}
              className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-200 outline-none"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as UserStatus | 'all', page: 1 }))}
              className="rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-200 outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <Filter className="h-4 w-4" />
              Apply
            </button>
          </form>
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900/50">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Users className="h-10 w-10 text-neutral-700" />
              <div>
                <p className="text-lg font-medium text-neutral-300">No users found</p>
                <p className="text-sm text-neutral-500">Adjust the filters or create a new account.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden xl:grid xl:grid-cols-[minmax(240px,1.5fr)_110px_110px_170px_100px_100px_160px_120px] gap-4 border-b border-neutral-800 bg-neutral-950/70 px-6 py-4 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                <span>User</span>
                <span>Role</span>
                <span>Status</span>
                <span>Storage</span>
                <span>Projects</span>
                <span>Libraries</span>
                <span>Last Login</span>
                <span>Actions</span>
              </div>
              <div className="divide-y divide-neutral-800">
                {users.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setActiveUserId(user.id)}
                    className="grid cursor-pointer gap-4 px-6 py-5 text-left transition hover:bg-neutral-800/30 xl:grid-cols-[minmax(240px,1.5fr)_110px_110px_170px_100px_100px_160px_120px]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-300">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{user.email}</p>
                          <p className="truncate text-xs text-neutral-500">{user.id}</p>
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
                      <p className="text-sm text-neutral-200">{formatBytes(user.usedStorage)} / {formatBytes(user.storageLimit || 0)}</p>
                      <p className="text-xs text-neutral-500">{storageTierName(user.storageLimit)}</p>
                    </div>

                    <div className="text-sm text-neutral-300">{user.projectCount}</div>
                    <div className="text-sm text-neutral-300">{user.libraryCount}</div>
                    <div className="space-y-1">
                      <p className="text-sm text-neutral-300">{formatRelativeDate(user.lastLoginAt)}</p>
                      <p className="text-xs text-neutral-500">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never signed in'}</p>
                    </div>

                    <div className="flex items-center justify-start gap-2" onClick={(event) => event.stopPropagation()}>
                      <select
                        value={user.role}
                        disabled={user.id === currentUser?.id}
                        onChange={(e) => void handleRoleChange(user.id, e.target.value as UserRole)}
                        className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-200 outline-none disabled:opacity-50"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="flex flex-col gap-3 rounded-3xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-neutral-400">
            {total > 0 ? `Showing ${users.length} of ${total} users` : 'No users to show'}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filters.pageSize}
              onChange={(e) => setFilters((current) => ({ ...current, pageSize: Number(e.target.value), page: 1 }))}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none"
            >
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
              className="rounded-xl border border-neutral-800 bg-neutral-950 p-2 text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-neutral-400">Page {filters.page} of {pages}</span>
            <button
              type="button"
              disabled={filters.page >= pages}
              onClick={() => setFilters((current) => ({ ...current, page: Math.min(pages, current.page + 1) }))}
              className="rounded-xl border border-neutral-800 bg-neutral-950 p-2 text-neutral-300 transition hover:bg-neutral-900 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-white">Create User</h3>
                <p className="mt-1 text-sm text-neutral-500">Provision a new account. Password is optional for OAuth-only users.</p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-xl border border-neutral-800 p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-5 px-6 py-6">
              <label className="block space-y-2">
                <span className="text-sm text-neutral-400">Email</span>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((current) => ({ ...current, email: e.target.value }))}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-neutral-400">Initial Password <span className="text-neutral-600">(optional)</span></span>
                <input
                  type="password"
                  minLength={8}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((current) => ({ ...current, password: e.target.value }))}
                  placeholder="Leave empty for OAuth-only accounts"
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block space-y-2">
                  <span className="text-sm text-neutral-400">Role</span>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((current) => ({ ...current, role: e.target.value as UserRole }))}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-neutral-400">Status</span>
                  <select
                    value={createForm.status}
                    onChange={(e) => setCreateForm((current) => ({ ...current, status: e.target.value as UserStatus }))}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-neutral-400">Storage</span>
                  <select
                    value={createForm.storageLimit}
                    onChange={(e) => setCreateForm((current) => ({ ...current, storageLimit: Number(e.target.value) }))}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
                  >
                    {STORAGE_TIERS.map((tier) => (
                      <option key={tier.value} value={tier.value}>{tier.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-neutral-800 pt-4">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="rounded-2xl px-4 py-3 text-sm text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/25 disabled:opacity-60"
                >
                  {createLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeUserId && (
        <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm">
          <div className="absolute inset-y-0 right-0 flex w-full justify-end">
            <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-neutral-800 bg-neutral-950 shadow-2xl">
              <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
                <div>
                  <h3 className="text-xl font-semibold text-white">User Detail</h3>
                  <p className="mt-1 text-sm text-neutral-500">Inspect account state, usage, and perform admin actions.</p>
                </div>
                <button type="button" onClick={() => setActiveUserId(null)} className="rounded-xl border border-neutral-800 p-2 text-neutral-400 transition hover:bg-neutral-800 hover:text-white">
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
                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Account</p>
                        <h4 className="mt-2 text-2xl font-semibold text-white">{activeUser.email}</h4>
                        <p className="mt-2 text-sm text-neutral-500">{activeUser.id}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${roleBadgeClass(activeUser.role)}`}>{activeUser.role}</span>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(activeUser.status)}`}>{activeUser.status}</span>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      <Stat label="Created" value={formatDate(activeUser.createdAt)} icon={<Clock3 className="h-4 w-4" />} />
                      <Stat label="Last Login" value={formatDate(activeUser.lastLoginAt)} icon={<CheckCircle2 className="h-4 w-4" />} />
                      <Stat label="Storage Tier" value={storageTierName(activeUser.storageLimit)} icon={<HardDrive className="h-4 w-4" />} />
                      <Stat label="Used / Limit" value={`${formatBytes(activeUser.usedStorage)} / ${formatBytes(activeUser.storageLimit || 0)}`} icon={<Shield className="h-4 w-4" />} />
                    </div>
                  </section>

                  <section className="grid gap-4 md:grid-cols-4">
                    <MiniCard label="Projects" value={activeUser.projectCount} />
                    <MiniCard label="Libraries" value={activeUser.libraryCount} />
                    <MiniCard label="Providers" value={activeUser.providerCount} />
                    <MiniCard label="Exports" value={activeUser.exportCount} />
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Storage Breakdown</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <StorageRow label="Projects" value={activeUser.storageBreakdown.projects} />
                      <StorageRow label="Libraries" value={activeUser.storageBreakdown.libraries} />
                      <StorageRow label="Exports" value={activeUser.storageBreakdown.exports} />
                      <StorageRow label="Trash" value={activeUser.storageBreakdown.trash} />
                    </div>
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Controls</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-neutral-400">Role</span>
                        <select
                          value={activeUser.role}
                          disabled={activeUser.id === currentUser?.id}
                          onChange={(e) => void handleRoleChange(activeUser.id, e.target.value as UserRole)}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm text-neutral-400">Storage Limit</span>
                        <select
                          value={activeUser.storageLimit || STORAGE_TIERS[0].value}
                          onChange={(e) => void handleStorageLimitChange(activeUser.id, Number(e.target.value))}
                          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
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
                        {activeUser.status === 'active' ? 'Disable User' : 'Enable User'}
                      </button>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-neutral-400" />
                      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Password Reset</p>
                    </div>
                    {canResetPassword ? (
                      <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
                        <label className="block space-y-2">
                          <span className="text-sm text-neutral-400">New Password</span>
                          <input
                            type="password"
                            minLength={8}
                            required
                            value={resetPassword}
                            onChange={(e) => setResetPassword(e.target.value)}
                            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={resettingPassword}
                          className="inline-flex items-center gap-2 rounded-2xl border border-blue-500/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-500/25 disabled:opacity-60"
                        >
                          {resettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                          Reset Password
                        </button>
                      </form>
                    ) : (
                      <p className="mt-4 text-sm text-neutral-500">Use the account settings page to change your own password.</p>
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
        title={pendingStatusChange?.status === 'active' ? 'Enable User' : 'Disable User'}
        message={pendingStatusChange ? `Are you sure you want to ${pendingStatusChange.status === 'active' ? 'enable' : 'disable'} ${pendingStatusChange.email}?` : ''}
        confirmText={pendingStatusChange?.status === 'active' ? 'Enable User' : 'Disable User'}
        type={pendingStatusChange?.status === 'active' ? 'info' : 'danger'}
      />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 text-sm text-neutral-200">{value}</p>
    </div>
  );
}

function MiniCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function StorageRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-950/70 px-4 py-3">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm font-medium text-neutral-100">{formatBytes(value)}</span>
    </div>
  );
}
