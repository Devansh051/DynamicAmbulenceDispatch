import React, { useState, useEffect, useCallback } from 'react';
import userService from '../services/userService';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Shield,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  X,
  MoreVertical,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Provisioning modal state
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('DISPATCHER');
  const [newTempPassword, setNewTempPassword] = useState('');
  const [provisionSuccessData, setProvisionSuccessData] = useState(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(async (page = 1) => {
    setIsLoading(true);
    setActionError(null);
    try {
      const data = await userService.getUsers({
        page,
        limit: 10,
        search,
        role: roleFilter,
        status: statusFilter
      });
      setUsers(data.users || []);
      setPagination(data.pagination);
    } catch (err) {
      setActionError(err.message || 'Failed to fetch users');
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers(1);
  }, [fetchUsers]);

  const handleStatusChange = async (userId, newStatus) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await userService.updateStatus(userId, newStatus);
      setActionSuccess(`Account status updated to ${newStatus}`);
      fetchUsers(pagination.page);
    } catch (err) {
      setActionError(err.message || 'Failed to update status');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await userService.updateRole(userId, newRole);
      setActionSuccess(`Account role changed to ${newRole}`);
      fetchUsers(pagination.page);
    } catch (err) {
      setActionError(err.message || 'Failed to update role');
    }
  };

  const handleProvisionSubmit = async (e) => {
    e.preventDefault();
    setIsProvisioning(true);
    setActionError(null);
    try {
      const result = await userService.provisionUser({
        email: newEmail,
        name: newName,
        role: newRole,
        temporaryPassword: newTempPassword || null
      });
      setProvisionSuccessData(result);
      fetchUsers(1);
    } catch (err) {
      setActionError(err.message || 'Failed to provision user');
    } finally {
      setIsProvisioning(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetProvisionModal = () => {
    setShowProvisionModal(false);
    setProvisionSuccessData(null);
    setNewEmail('');
    setNewName('');
    setNewRole('DISPATCHER');
    setNewTempPassword('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Provision Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            User Management & Access Control
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Provision staff accounts, assign operational roles, and enforce security policies.
          </p>
        </div>

        <button
          onClick={() => setShowProvisionModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/25 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Provision New Account
        </button>
      </div>

      {/* Action feedback banners */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="DISPATCHER">DISPATCHER</option>
            <option value="AMBULANCE_CREW">AMBULANCE_CREW</option>
            <option value="HOSPITAL_OPERATOR">HOSPITAL_OPERATOR</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="PENDING">PENDING</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0B1120] text-slate-400 font-mono text-[11px] border-b border-slate-800 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Operator</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Auth Methods</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                      <span>Loading accounts...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-500">
                    No users match the specified criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold flex items-center justify-center text-xs">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{u.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-mono font-medium text-blue-300 focus:outline-none focus:border-blue-500"
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="DISPATCHER">DISPATCHER</option>
                        <option value="AMBULANCE_CREW">AMBULANCE_CREW</option>
                        <option value="HOSPITAL_OPERATOR">HOSPITAL_OPERATOR</option>
                      </select>
                    </td>

                    <td className="py-3 px-4">
                      <select
                        value={u.status}
                        onChange={(e) => handleStatusChange(u.id, e.target.value)}
                        className={`border rounded-lg px-2 py-1 text-[11px] font-mono font-semibold focus:outline-none ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                            : u.status === 'PENDING'
                            ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
                            : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                        }`}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="PENDING">PENDING</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                      </select>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {u.has_local_password && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                            Password
                          </span>
                        )}
                        {u.linked_providers?.map((p) => (
                          <span
                            key={p.provider}
                            className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800/60 text-rose-300 text-[10px] font-mono"
                          >
                            {p.provider}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {u.must_change_password && (
                        <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-900/30 border border-amber-800/40">
                          Temp Pass Active
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing page <span className="font-semibold text-white">{pagination.page}</span> of{' '}
              <span className="font-semibold text-white">{pagination.totalPages}</span> ({pagination.total} operators)
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchUsers(pagination.page - 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchUsers(pagination.page + 1)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Provision User Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-400" />
                Provision Operator Account
              </h2>
              <button onClick={resetProvisionModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {provisionSuccessData ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold">Account Successfully Provisioned</p>
                    <p className="mt-0.5 leading-relaxed text-[11px]">
                      Share the temporary credentials below with the staff member. They will be required to change their password upon their first sign-in.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Email:</span>
                    <span className="font-mono text-white">{provisionSuccessData.user.email}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Role:</span>
                    <span className="font-mono text-blue-400 font-semibold">{provisionSuccessData.user.role}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 text-[11px] block">Temporary Password:</span>
                      <span className="font-mono text-amber-300 font-bold text-sm tracking-wider">
                        {provisionSuccessData.temporaryPassword}
                      </span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(provisionSuccessData.temporaryPassword)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 transition-all shadow-md"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={resetProvisionModal}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium"
                >
                  Close & Refresh Users
                </button>
              </div>
            ) : (
              <form onSubmit={handleProvisionSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Staff Email Address
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="operator@ems-dispatch.local"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Display Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Jane Doe, EMT-P"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Assigned Operational Role
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="DISPATCHER">DISPATCHER (Emergency Operations)</option>
                    <option value="AMBULANCE_CREW">AMBULANCE_CREW (Vehicle Operators)</option>
                    <option value="HOSPITAL_OPERATOR">HOSPITAL_OPERATOR (Hospital Admissions)</option>
                    <option value="ADMIN">ADMIN (System Administrator)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom Temporary Password (Optional)
                  </label>
                  <input
                    type="text"
                    value={newTempPassword}
                    onChange={(e) => setNewTempPassword(e.target.value)}
                    placeholder="Leave empty to auto-generate secure password"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={resetProvisionModal}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isProvisioning}
                    className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 disabled:opacity-50"
                  >
                    {isProvisioning ? 'Provisioning...' : 'Provision Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
