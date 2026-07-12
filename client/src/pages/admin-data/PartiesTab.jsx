import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';

const AUTO_COLOR = '#9e9e9e';
const MAX_ROWS = 50;

// "Registry" parties are hand-curated: they have a real color or aliases.
// Everything else is an auto-registered raw name from an import.
function isRegistry(p) {
  return (
    (p.color && p.color.toLowerCase() !== AUTO_COLOR) ||
    (Array.isArray(p.aliases) && p.aliases.length > 0)
  );
}

function downloadFile(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function splitAliases(text) {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function PartiesTab({ notify }) {
  const { data: parties, error, loading, refetch } = useApi('/api/data/parties');
  const [search, setSearch] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const matches = useMemo(() => {
    if (!parties) return [];
    const q = search.trim().toLowerCase();
    if (q) {
      return parties.filter(
        (p) =>
          p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
      );
    }
    return showRaw ? parties : parties.filter(isRegistry);
  }, [parties, search, showRaw]);

  const shown = matches.slice(0, MAX_ROWS);

  return (
    <>
      <AddPartyCard notify={notify} refetch={refetch} />

      <div className="card">
        <h2 className="card-title">
          Parties
          {parties && <span className="heading-count">{parties.length}</span>}
        </h2>

        <div className="adm-toolbar">
          <input
            className="input adm-search"
            type="search"
            placeholder="Search by code or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search parties"
          />
          {!search.trim() && (
            <label className="adm-check">
              <input
                type="checkbox"
                checked={showRaw}
                onChange={(e) => setShowRaw(e.target.checked)}
              />
              show auto-registered raw parties
            </label>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm adm-push-right"
            onClick={() => downloadFile('/api/admin/data/export/parties')}
          >
            Download parties.json
          </button>
        </div>

        {loading && (
          <div className="spinner-wrap">
            <div className="spinner" aria-label="Loading parties" />
          </div>
        )}
        {error && <p className="form-error">Could not load parties: {error.message}</p>}

        {parties && (
          <>
            <div className="table-scroll">
              <table className="admin-table adm-parties-table">
                <thead>
                  <tr>
                    <th>Color</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Aliases (comma-separated)</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <PartyRow key={p.code} party={p} notify={notify} refetch={refetch} />
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length === 0 && (
              <p className="adm-empty">No parties match.</p>
            )}
            {matches.length > MAX_ROWS && (
              <p className="adm-more">
                {matches.length - MAX_ROWS} more matches — refine your search.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function PartyRow({ party, notify, refetch }) {
  // Draft holds only fields the admin touched; everything else reads from
  // props, so refetches keep untouched rows in sync automatically.
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState(null);

  const baseAliases = (party.aliases || []).join(', ');
  const value = {
    name: draft.name !== undefined ? draft.name : party.name || '',
    color: draft.color !== undefined ? draft.color : party.color || AUTO_COLOR,
    aliases: draft.aliases !== undefined ? draft.aliases : baseAliases,
  };
  const dirty =
    value.name !== (party.name || '') ||
    value.color.toLowerCase() !== (party.color || AUTO_COLOR).toLowerCase() ||
    value.aliases !== baseAliases;

  async function handleSave() {
    if (!value.name.trim()) {
      setRowError('Name is required.');
      return;
    }
    setBusy(true);
    setRowError(null);
    try {
      await api.patch(`/api/admin/data/parties/${encodeURIComponent(party.code)}`, {
        name: value.name.trim(),
        color: value.color,
        aliases: splitAliases(value.aliases),
      });
      setDraft({});
      notify('success', `Saved ${party.code}.`);
      refetch();
    } catch (err) {
      setRowError(err.message || 'Could not save party');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete party ${party.code}? This cannot be undone.`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await api.del(`/api/admin/data/parties/${encodeURIComponent(party.code)}`);
      notify('success', `Deleted ${party.code}.`);
      refetch();
    } catch (err) {
      // 409 when the party is referenced by candidates/alliances.
      setRowError(err.message || 'Could not delete party');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td>
          <input
            className="swatch-input"
            type="color"
            value={value.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            aria-label={`Color for ${party.code}`}
          />
        </td>
        <td className="mono">{party.code}</td>
        <td>
          <input
            className="input input-cell"
            type="text"
            value={value.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label={`Name for ${party.code}`}
          />
        </td>
        <td>
          <input
            className="input input-cell"
            type="text"
            value={value.aliases}
            onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
            placeholder="Alias 1, Alias 2…"
            aria-label={`Aliases for ${party.code}`}
          />
        </td>
        <td className="actions-col">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!dirty || busy}
            onClick={handleSave}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={handleDelete}
          >
            Delete
          </button>
        </td>
      </tr>
      {rowError && (
        <tr className="row-error">
          <td colSpan={5}>{rowError}</td>
        </tr>
      )}
    </>
  );
}

function AddPartyCard({ notify, refetch }) {
  const emptyForm = { code: '', name: '', color: '#1d4fd7', aliases: '' };
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [adding, setAdding] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    const code = form.code.trim();
    const name = form.name.trim();
    if (!code) {
      setFormError('Code is required.');
      return;
    }
    if (!name) {
      setFormError('Name is required.');
      return;
    }
    setAdding(true);
    setFormError(null);
    try {
      const res = await api.post('/api/admin/data/parties', {
        code,
        name,
        color: form.color,
        aliases: splitAliases(form.aliases),
      });
      notify('success', `Added party ${res.party.code}.`);
      setForm(emptyForm);
      refetch();
    } catch (err) {
      setFormError(err.message || 'Could not add party');
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className="card" onSubmit={handleAdd}>
      <h2 className="card-title">Add party</h2>
      <div className="adm-form-row">
        <label className="field adm-field-code">
          <span className="label">Code</span>
          <input
            className="input mono"
            type="text"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="BJP"
          />
        </label>
        <label className="field">
          <span className="label">Name</span>
          <input
            className="input"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Bharatiya Janata Party"
          />
        </label>
        <label className="field adm-field-swatch">
          <span className="label">Color</span>
          <input
            className="swatch-input"
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="label">Aliases (comma-separated)</span>
          <input
            className="input"
            type="text"
            value={form.aliases}
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
            placeholder="Alias 1, Alias 2…"
          />
        </label>
        <div className="field adm-field-submit">
          <button className="btn btn-primary" type="submit" disabled={adding}>
            {adding ? 'Adding…' : 'Add party'}
          </button>
        </div>
      </div>
      {formError && <p className="form-error">{formError}</p>}
    </form>
  );
}
