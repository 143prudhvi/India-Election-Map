import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';

export default function StatesTab({ notify }) {
  const { data: states, error, loading, refetch } = useApi('/api/data/states');

  return (
    <div className="card">
      <h2 className="card-title">States</h2>
      <p className="card-hint">
        Only the display name is editable — slug, seats and loaded years come from the data.
      </p>

      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" aria-label="Loading states" />
        </div>
      )}
      {error && <p className="form-error">Could not load states: {error.message}</p>}

      {states && (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th className="adm-num-col">Seats</th>
                <th>Years</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {states.map((s) => (
                <StateRow key={s.slug} state={s} notify={notify} refetch={refetch} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateRow({ state, notify, refetch }) {
  const [name, setName] = useState(null); // null = untouched, mirrors props
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState(null);

  const value = name !== null ? name : state.name;
  const dirty = value !== state.name;

  async function handleSave() {
    if (!value.trim()) {
      setRowError('Name is required.');
      return;
    }
    setBusy(true);
    setRowError(null);
    try {
      await api.patch(`/api/admin/data/states/${encodeURIComponent(state.slug)}`, {
        name: value.trim(),
      });
      setName(null);
      notify('success', `Renamed ${state.slug} to ${value.trim()}.`);
      refetch();
    } catch (err) {
      setRowError(err.message || 'Could not save state');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr>
        <td>
          <input
            className="input input-cell"
            type="text"
            value={value}
            onChange={(e) => setName(e.target.value)}
            aria-label={`Name for ${state.slug}`}
          />
        </td>
        <td className="mono">{state.slug}</td>
        <td className="adm-num-col">{state.total_seats}</td>
        <td className="mono">{(state.years || []).join(', ') || '—'}</td>
        <td className="actions-col">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!dirty || busy}
            onClick={handleSave}
          >
            {busy ? 'Saving…' : 'Save'}
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
