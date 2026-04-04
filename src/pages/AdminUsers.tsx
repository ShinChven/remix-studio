import React, { useEffect, useState } from 'react';
import { getUsers, updateUserRole } from '../api';
import { User, UserRole } from '../types';
import { Loader2, Shield, User as UserIcon, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user: currentUser } = useAuth();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    try {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      await updateUserRole(userId, newRole);
    } catch (err: any) {
      setError(err.message || 'Failed to update role');
      loadUsers(); // Revert on failure
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-zinc-100">User Management</h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/50">
              <th className="py-4 px-6 text-sm font-medium text-zinc-400">Email Address</th>
              <th className="py-4 px-6 text-sm font-medium text-zinc-400">ID</th>
              <th className="py-4 px-6 text-sm font-medium text-zinc-400">Role</th>
              <th className="py-4 px-6 text-sm font-medium text-zinc-400 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-800/20 transition-colors">
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                      <UserIcon className="w-4 h-4 text-zinc-400" />
                    </div>
                    <span className="font-medium text-zinc-200">
                      {user.email}
                      {user.id === currentUser?.id && (
                        <span className="ml-2 text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">
                          You
                        </span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="py-4 px-6 font-mono text-xs text-zinc-500">{user.id}</td>
                <td className="py-4 px-6">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                    user.role === 'admin' 
                      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="py-4 px-6 text-right">
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                    disabled={user.id === currentUser?.id}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-500">
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
