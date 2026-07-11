import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Profile() {
  const { user, setUser } = useAuth();

  return (
    <div className="page narrow-page">
      <h1 className="page-title">Profile</h1>
      <DisplayNameCard user={user} setUser={setUser} />
      <ChangePasswordCard />
    </div>
  );
}

function DisplayNameCard({ user, setUser }) {
  const [name, setName] = useState(user?.display_name || '');
  const [status, setStatus] = useState(null); // {type: 'success'|'error', text}
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setPending(true);
    try {
      const res = await api.patch('/api/profile', { display_name: name.trim() });
      setUser(res.user);
      setStatus({ type: 'success', text: 'Display name saved.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'Could not save display name' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 className="card-title">Display name</h2>
      <p className="card-hint">Signed in as {user?.email}</p>
      <label className="field">
        <span className="label">Display name</span>
        <input
          className="input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      {status && (
        <p className={status.type === 'error' ? 'form-error' : 'form-success'}>{status.text}</p>
      )}
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    if (next.length < 10) {
      setStatus({ type: 'error', text: 'New password must be at least 10 characters.' });
      return;
    }
    if (next !== confirm) {
      setStatus({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPending(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      setStatus({ type: 'success', text: 'Password changed.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setStatus({ type: 'error', text: err.message || 'Could not change password' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2 className="card-title">Change password</h2>
      <label className="field">
        <span className="label">Current password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="label">New password (min 10 characters)</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="label">Confirm new password</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>
      {status && (
        <p className={status.type === 'error' ? 'form-error' : 'form-success'}>{status.text}</p>
      )}
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
