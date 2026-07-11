import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ForceChangePassword() {
  const { refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (next.length < 10) {
      setError('New password must be at least 10 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setPending(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      // Reload the user: must_change_password is now false, gate lifts.
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not change password');
      setPending(false);
    }
  }

  return (
    <div className="page-center">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-subtitle">
          Your account is using a temporary password. Choose a new one to continue —
          it must be at least 10 characters.
        </p>

        <label className="field">
          <span className="label">Current (temporary) password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span className="label">New password</span>
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

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Change password and continue'}
        </button>
      </form>
    </div>
  );
}
