import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useAuth } from '../auth/AuthContext.jsx';
import '../styles/apiKeys.css';

export default function ApiKeys() {
  const { user } = useAuth();
  const isPro = !!user && (user.role === 'admin' || user.tier === 'pro');

  if (!isPro) return <UpgradePrompt />;
  return <ApiKeysManager />;
}

function UpgradePrompt() {
  const navigate = useNavigate();
  return (
    <div className="page wide-page">
      <h1 className="page-title">API Keys</h1>
      <div className="card">
        <h2 className="card-title">Programmatic access is a Pro feature</h2>
        <p>
          Mint API keys to read election data programmatically from your own apps and scripts —
          states, parties, results, and summaries over a simple JSON API.
        </p>
        <p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/upgrade')}>
            Upgrade to Pro
          </button>
        </p>
      </div>
    </div>
  );
}

function ApiKeysManager() {
  const { data, error, loading, refetch } = useApi('/api/keys');
  const [notice, setNotice] = useState(null); // {type, text}
  const [modal, setModal] = useState(null); // {name, plaintext}
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const baseUrl = `${window.location.origin}/api/v1`;
  const example = `curl -H "X-API-Key: YOUR_KEY" ${window.location.origin}/api/v1/delhi/2020/results`;

  async function handleCreate(e) {
    e.preventDefault();
    setNotice(null);
    setCreating(true);
    try {
      const res = await api.post('/api/keys', { name: name.trim() });
      setModal({ name: res.key.name, plaintext: res.plaintext });
      setName('');
      refetch();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not create key' });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(k) {
    if (!window.confirm(`Revoke this key? Any app using it will stop working immediately.`)) return;
    setNotice(null);
    setBusyId(k.id);
    try {
      await api.del(`/api/keys/${k.id}`);
      setNotice({ type: 'success', text: 'Key revoked.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Could not revoke key' });
    } finally {
      setBusyId(null);
      refetch();
    }
  }

  return (
    <div className="page wide-page">
      <h1 className="page-title">API Keys</h1>

      {notice && (
        <p className={notice.type === 'error' ? 'notice notice-error' : 'notice notice-success'}>
          {notice.text}
        </p>
      )}

      <div className="card">
        <h2 className="card-title">Programmatic access</h2>
        <p>
          Use an API key for read-only access to election data. Send it as an{' '}
          <code>X-API-Key</code> header or <code>Authorization: Bearer</code>. Base URL:
        </p>
        <pre className="api-usage">{baseUrl}</pre>
        <p>Example:</p>
        <pre className="api-usage">{example}</pre>
      </div>

      <form className="card" onSubmit={handleCreate}>
        <h2 className="card-title">Create key</h2>
        <div className="form-row">
          <label className="field">
            <span className="label">Name (optional)</span>
            <input
              className="input"
              type="text"
              maxLength={60}
              placeholder="e.g. my-dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="field field-submit">
            <button className="btn btn-primary" type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create key'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <h2 className="card-title">Your keys</h2>
        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" aria-label="Loading keys" />
          </div>
        )}
        {error && <p className="form-error">Could not load keys: {error.message}</p>}
        {data && data.keys.length === 0 && <p>You have no API keys yet.</p>}
        {data && data.keys.length > 0 && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.keys.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name || <span className="muted">—</span>}</td>
                    <td>
                      <code className="api-key-prefix">{k.key_prefix}…</code>
                    </td>
                    <td>{formatDate(k.created_at)}</td>
                    <td>{k.last_used_at ? formatDate(k.last_used_at) : 'never'}</td>
                    <td>
                      {k.revoked ? (
                        <span className="badge badge-warn">Revoked</span>
                      ) : (
                        <span className="badge badge-ok">Active</span>
                      )}
                    </td>
                    <td className="actions-col">
                      {!k.revoked && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busyId === k.id}
                          onClick={() => handleRevoke(k)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <NewKeyModal name={modal.name} plaintext={modal.plaintext} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function NewKeyModal({ name, plaintext, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the key is still visible for manual copy.
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Your new API key</h3>
        {name && (
          <p>
            <strong>{name}</strong>
          </p>
        )}
        <p>Copy it now and store it securely.</p>
        <pre className="api-usage api-key-full">{plaintext}</pre>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="modal-warning">
          This key will not be shown again. If you lose it, revoke it and create a new one.
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

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
