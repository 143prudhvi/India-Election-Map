import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';

const AUTO_COLOR = '#9e9e9e';

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

let blocSeq = 0;

export default function AlliancesTab({ notify }) {
  const { data: states } = useApi('/api/data/states', { cached: true });
  const { data: parties } = useApi('/api/data/parties');

  const electionStates = useMemo(
    () => (states || []).filter((s) => s.years && s.years.length > 0),
    [states]
  );

  const [stateSlug, setStateSlug] = useState('');
  const [year, setYear] = useState('');

  const selectedState = electionStates.find((s) => s.slug === stateSlug) || null;
  const resultsUrl =
    stateSlug && year ? `/api/data/${stateSlug}/${year}/results` : null;
  const { data: results, error, loading, refetch } = useApi(resultsUrl);

  const [blocs, setBlocs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAlliances, setSavedAlliances] = useState(null); // recomputed rows after a save

  // Re-seed the draft whenever fresh results arrive. The synthetic OTH
  // ("Others / Unaligned") bucket is server-computed, never edited here.
  useEffect(() => {
    const defs = (results?.summary?.alliances || []).filter((a) => a.alliance !== 'OTH');
    setBlocs(
      defs.map((a) => ({
        id: ++blocSeq,
        code: a.alliance,
        name: a.name || '',
        color: a.color || '#888888',
        parties: (a.parties || []).map((m) => (typeof m === 'string' ? m : m.party)),
      }))
    );
    setSaveError(null);
  }, [results]);

  // A new state/year selection invalidates the last save report.
  useEffect(() => {
    setSavedAlliances(null);
    setSaveError(null);
  }, [resultsUrl]);

  function handleStateChange(slug) {
    setStateSlug(slug);
    const st = electionStates.find((s) => s.slug === slug);
    setYear(st && st.years.length > 0 ? String(Math.max(...st.years)) : '');
  }

  const partyOptions = useMemo(() => {
    const codes = new Set();
    for (const p of results?.summary?.parties || []) codes.add(p.party);
    for (const p of parties || []) if (isRegistry(p)) codes.add(p.code);
    return [...codes].sort();
  }, [results, parties]);

  function updateBloc(id, patch) {
    setBlocs((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBloc(id) {
    setBlocs((bs) => bs.filter((b) => b.id !== id));
  }

  function addBloc() {
    setBlocs((bs) => [
      ...bs,
      { id: ++blocSeq, code: '', name: '', color: '#1d4fd7', parties: [] },
    ]);
  }

  async function saveBlocs(payload, successText) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.put(`/api/admin/data/${stateSlug}/${year}/alliances`, {
        alliances: payload,
      });
      setSavedAlliances(res.summary?.alliances || []);
      notify('success', successText);
      refetch();
    } catch (err) {
      setSaveError(err.message || 'Could not save alliances');
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    for (const b of blocs) {
      const code = b.code.trim();
      if (!code) return setSaveError('Every bloc needs a code.');
      if (code.length > 12) return setSaveError(`Bloc code "${code}" is over 12 characters.`);
      if (!b.name.trim()) return setSaveError(`Bloc ${code} needs a name.`);
      if (b.parties.length === 0) return setSaveError(`Bloc ${code} has no member parties.`);
    }
    saveBlocs(
      blocs.map((b) => ({
        code: b.code.trim(),
        name: b.name.trim(),
        color: b.color,
        parties: b.parties,
      })),
      `Saved alliances for ${selectedState?.name || stateSlug} ${year}.`
    );
  }

  function handleClear() {
    if (
      !window.confirm(
        `Clear all alliances for ${selectedState?.name || stateSlug} ${year}? The election reverts to the party-only view.`
      )
    ) {
      return;
    }
    saveBlocs([], `Cleared alliances for ${selectedState?.name || stateSlug} ${year}.`);
  }

  return (
    <div className="card">
      <h2 className="card-title">Alliances</h2>

      <div className="adm-picker-row">
        <label className="field adm-field-inline">
          <span className="label">State</span>
          <select
            className="select"
            value={stateSlug}
            onChange={(e) => handleStateChange(e.target.value)}
          >
            <option value="">Select state…</option>
            {electionStates.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field adm-field-inline">
          <span className="label">Year</span>
          <select
            className="select"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            disabled={!selectedState}
          >
            <option value="">Year…</option>
            {(selectedState?.years || []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <div className="field adm-field-inline adm-push-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => downloadFile('/api/admin/data/export/alliances')}
          >
            Download alliances.json
          </button>
        </div>
      </div>

      {!resultsUrl && <p className="adm-empty">Pick a state and year to edit its alliances.</p>}

      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" aria-label="Loading results" />
        </div>
      )}
      {error && <p className="form-error">Could not load results: {error.message}</p>}

      {results && (
        <>
          {blocs.length === 0 && (
            <p className="adm-empty">
              No alliances defined for this election yet. Add a bloc to get started.
            </p>
          )}

          {blocs.map((b) => (
            <BlocCard
              key={b.id}
              bloc={b}
              onChange={(patch) => updateBloc(b.id, patch)}
              onRemove={() => removeBloc(b.id)}
            />
          ))}

          <datalist id="alliance-party-options">
            {partyOptions.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>

          {saveError && <p className="form-error">{saveError}</p>}

          <div className="adm-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={addBloc}>
              Add bloc
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'Save alliances'}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={saving}
              onClick={handleClear}
            >
              Clear alliances
            </button>
          </div>

          {savedAlliances && savedAlliances.length > 0 && (
            <div className="adm-saved-summary">
              <h3 className="sidebar-heading-sm">Recomputed bloc totals</h3>
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Bloc</th>
                    <th className="num">Seats</th>
                    <th className="num">Votes</th>
                    <th className="num">Vote %</th>
                  </tr>
                </thead>
                <tbody>
                  {savedAlliances.map((a) => (
                    <tr key={a.alliance}>
                      <td>
                        <span className="alliance-cell">
                          <span
                            className="alliance-dot"
                            style={{ backgroundColor: a.color }}
                          />
                          <span className="mono">{a.alliance}</span> {a.name}
                        </span>
                      </td>
                      <td className="num">{a.seats}</td>
                      <td className="num">{a.votes.toLocaleString('en-IN')}</td>
                      <td className="num">{a.vote_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {savedAlliances && savedAlliances.length === 0 && (
            <p className="adm-empty">Alliances cleared — this election now shows parties only.</p>
          )}
        </>
      )}
    </div>
  );
}

function BlocCard({ bloc, onChange, onRemove }) {
  const [text, setText] = useState('');

  function addParty(raw) {
    const code = raw.trim();
    if (!code) return;
    if (!bloc.parties.includes(code)) {
      onChange({ parties: [...bloc.parties, code] });
    }
    setText('');
  }

  function removeParty(code) {
    onChange({ parties: bloc.parties.filter((p) => p !== code) });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addParty(text);
    } else if (e.key === 'Backspace' && !text && bloc.parties.length > 0) {
      removeParty(bloc.parties[bloc.parties.length - 1]);
    }
  }

  return (
    <div className="bloc-card">
      <div className="bloc-head">
        <label className="field adm-field-inline adm-field-code">
          <span className="label">Code</span>
          <input
            className="input mono"
            type="text"
            maxLength={12}
            value={bloc.code}
            onChange={(e) => onChange({ code: e.target.value })}
            placeholder="NDA"
          />
        </label>
        <label className="field adm-field-inline adm-field-grow">
          <span className="label">Name</span>
          <input
            className="input"
            type="text"
            value={bloc.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="National Democratic Alliance"
          />
        </label>
        <label className="field adm-field-inline adm-field-swatch">
          <span className="label">Color</span>
          <input
            className="swatch-input"
            type="color"
            value={bloc.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </label>
        <div className="field adm-field-inline">
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
            Remove bloc
          </button>
        </div>
      </div>

      <div className="tag-list">
        {bloc.parties.map((code) => (
          <span key={code} className="tag-chip">
            {code}
            <button
              type="button"
              className="tag-chip-x"
              onClick={() => removeParty(code)}
              aria-label={`Remove ${code}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          type="text"
          list="alliance-party-options"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addParty(text)}
          placeholder="Add party code… (Enter)"
          aria-label={`Add party to ${bloc.code || 'bloc'}`}
        />
      </div>
    </div>
  );
}
