import { useEffect, useState, useCallback } from 'react';
import { usersApi } from '../lib/api';
import { UserPlus, Pencil, UserX, RefreshCw, Search } from 'lucide-react';
import { toast } from '../components/Toast';
import './Page.css';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  device_count: number;
  last_login_at: string | null;
  created_at: string;
}

interface Form { email: string; name: string; password: string; role: string; }
const emptyForm: Form = { email: '', name: '', password: '', role: 'user' };

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await usersApi.list({ limit: 100, search: search || undefined });
      setUsers(res.data.data ?? []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ email: u.email, name: u.name, password: '', role: u.role });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editUser) {
        const payload: Partial<Form> = { name: form.name, role: form.role };
        if (form.password) payload.password = form.password;
        await usersApi.update(editUser.id, payload);
        toast.success('User updated');
      } else {
        await usersApi.create({ email: form.email, name: form.name, role: form.role, password: form.password });
        toast.success('User created');
      }
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (u: User) => {
    if (!confirm(`Deactivate user "${u.name}" (${u.email})?`)) return;
    try {
      await usersApi.deactivate(u.id);
      toast.success('User deactivated');
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to deactivate user');
    }
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>Manage user accounts</p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={fetchUsers}><RefreshCw size={15} /> Refresh</button>
          <button className="btn-primary" onClick={openCreate}><UserPlus size={15} /> Add User</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Devices</th>
                <th>Last Login</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={8} className="empty-row">No users found</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td className="mono small">{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'superadmin' ? 'badge-purple' : u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>
                        {u.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="small">{u.device_count}</td>
                    <td className="small">{fmt(u.last_login_at)}</td>
                    <td className="small">{fmt(u.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-icon" onClick={() => openEdit(u)} title="Edit"><Pencil size={15} /></button>
                        {u.is_active && (
                          <button className="btn-icon btn-danger" onClick={() => handleDeactivate(u)} title="Deactivate">
                            <UserX size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editUser ? 'Edit User' : 'Add User'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Email *</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editUser} />
                </div>
                <div className="form-group">
                  <label>{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editUser} />
                </div>
                <div className="form-group">
                  <label>Role *</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
