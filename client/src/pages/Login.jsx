import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import IndiaOutline from '../assets/IndiaOutline.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email.trim(), password);
      // Return to the page the user was originally heading for, if any.
      const from = location.state?.from;
      navigate(from ? `${from.pathname}${from.search || ''}` : '/', { replace: true });
    } catch (err) {
      if (err.status === 401) setError('Invalid email or password');
      else if (err.status === 429) setError('Too many attempts — try again later');
      else setError(err.message || 'Login failed');
      setPending(false);
    }
  }

  return (
    <div className="login-hero">
      <IndiaOutline className="login-map" />
      <div className="login-inner">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <h1 className="login-title">India Election Map</h1>
            <p className="login-tagline">
              Three decades of assembly elections, constituency by constituency
            </p>
          </div>
        </div>

        <form className="card auth-card" onSubmit={handleSubmit}>
          <h2 className="auth-title">Sign in</h2>
          <p className="auth-subtitle">Accounts are created by an administrator</p>

          <label className="field">
            <span className="label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-footnote">
          30 states &amp; union territories · assembly elections 2010–2026
        </p>
      </div>
    </div>
  );
}
