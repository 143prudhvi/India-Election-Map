import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { data, error, loading, refetch } = useApi('/api/admin/users');
  const [notice, setNotice] = useState(null); // {type: 'success'|'error', text}
  const [modal, setModal] = useState(null); // {email, tempPassword}
  const [busyId, setBusyId] = useState(null);

  const [form, setForm] = useState({ email: '', display_name: '', role: 'user' });
  const [creating, setCreating] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setNotice(null);
    setCreating(true);
    try {
      const res = await api.post('/api/admin/users', {
        email: form.email.trim(),
        display_name: form.display_name.trim(),
        role: form.role,
      });
      setModal({ email: res.user.email, tempPassword: res.temp_password });
      setForm({ email: '', display_name: '', role: 'user' });
      refetch();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not create user' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(u, role) {
    if (role === u.role) return;
    setNotice(null);
    setBusyId(u.id);
    try {
      await api.patch(`/api/admin/users/${u.id}`, { role });
      setNotice({ type: 'success', text: `${u.email} is now ${role}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not change role' });
    } finally {
      setBusyId(null);
      refetch();
    }
  }

  async function handleResetPassword(u) {
    if (!window.confirm(`Reset the password for ${u.email}? Their current password will stop working immediately.`)) {
      return;
    }
    setNotice(null);
    setBusyId(u.id);
    try {
      const res = await api.post(`/api/admin/users/${u.id}/reset-password`);
      setModal({ email: u.email, tempPassword: res.temp_password });
      refetch();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not reset password' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    setNotice(null);
    setBusyId(u.id);
    try {
      await api.del(`/api/admin/users/${u.id}`);
      setNotice({ type: 'success', text: `Deleted ${u.email}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not delete user' });
    } finally {
      setBusyId(null);
      refetch();
    }
  }

  return (
    <div className="page wide-page">
      <h1 className="page-title">Admin — Users</h1>

      {notice && (
        <p className={notice.type === 'error' ? 'notice notice-error' : 'notice notice-success'}>
          {notice.text}
        </p>
      )}

      <form className="card create-user-form" onSubmit={handleCreate}>
        <h2 className="card-title">Create user</h2>
        <div className="form-row">
          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span className="label">Display name</span>
            <input
              className="input"
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              required
            />
          </label>
          <label className="field field-compact">
            <span className="label">Role</span>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div className="field field-submit">
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <h2 className="card-title">Users</h2>
        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" aria-label="Loading users" />
          </div>
        )}
        {error && <p className="form-error">Could not load users: {error.message}</p>}
        {data && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Display name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.email}
                      {me && u.id === me.id && <span className="badge badge-you">you</span>}
                    </td>
                    <td>{u.display_name}</td>
                    <td>
                      <select
                        className="select select-sm"
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      {u.must_change_password ? (
                        <span className="badge badge-warn">temp password</span>
                      ) : (
                        <span className="badge badge-ok">active</span>
                      )}
                    </td>
                    <td className="actions-col">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === u.id}
                        onClick={() => handleResetPassword(u)}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busyId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <TempPasswordModal
          email={modal.email}
          tempPassword={modal.tempPassword}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function TempPasswordModal({ email, tempPassword, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the password is still visible for manual copy.
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Temporary password</h3>
        <p>
          For <strong>{email}</strong>. Share it with them securely.
        </p>
        <div className="temp-password">
          <code>{tempPassword}</code>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="modal-warning">
          This password will not be shown again. The user must change it at first login.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
