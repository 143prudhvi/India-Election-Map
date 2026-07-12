import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';
import { displayName } from '../../lib/formatName.js';

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

function acLabel(c) {
  return `${c.ac_no} — ${c.ac_name}`;
}

function winnerLine(c) {
  if (!c.winner) return 'No candidates yet.';
  const w = c.winner;
  let line = `${displayName(w.candidate)} (${w.party}), ${w.votes.toLocaleString('en-IN')} votes`;
  if (c.margin != null) line += ` — margin ${c.margin.toLocaleString('en-IN')} (${c.margin_pct}%)`;
  if (!c.declared) line += ' — not declared';
  return line;
}

export default function ResultsTab({ notify }) {
  const { data: states, refetch: refetchStates } = useApi('/api/data/states');
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

  const [pickText, setPickText] = useState('');
  const [acNo, setAcNo] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setPickText('');
    setAcNo(null);
  }, [resultsUrl]);

  function handleStateChange(slug) {
    setStateSlug(slug);
    const st = electionStates.find((s) => s.slug === slug);
    setYear(st && st.years.length > 0 ? String(Math.max(...st.years)) : '');
  }

  function handlePick(text) {
    setPickText(text);
    const t = text.trim();
    const c = (results?.constituencies || []).find(
      (x) => acLabel(x) === t || String(x.ac_no) === t
    );
    setAcNo(c ? c.ac_no : null);
  }

  const selected = (results?.constituencies || []).find((c) => c.ac_no === acNo) || null;

  const partyOptions = useMemo(() => {
    const codes = new Set();
    for (const p of results?.summary?.parties || []) codes.add(p.party);
    for (const p of parties || []) if (isRegistry(p)) codes.add(p.code);
    return [...codes].sort();
  }, [results, parties]);

  async function handleDeleteElection() {
    const label = `${selectedState?.name || stateSlug} ${year}`;
    if (!window.confirm(`Delete the entire ${label} election? All its constituencies, candidates and alliances go with it.`)) return;
    if (!window.confirm(`Really delete ${label}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.del(`/api/admin/data/${stateSlug}/${year}`);
      notify('success', `Deleted ${label}.`);
      setYear('');
      setPickText('');
      setAcNo(null);
      refetchStates();
    } catch (err) {
      notify('error', err.message || 'Could not delete election');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">Results</h2>

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
        {results && (
          <label className="field adm-field-inline adm-field-grow">
            <span className="label">Constituency</span>
            <input
              className="input"
              type="text"
              list="results-ac-options"
              value={pickText}
              onChange={(e) => handlePick(e.target.value)}
              placeholder="Type a number or name…"
            />
            <datalist id="results-ac-options">
              {results.constituencies.map((c) => (
                <option key={c.ac_no} value={acLabel(c)} />
              ))}
            </datalist>
          </label>
        )}
      </div>

      {resultsUrl && results && (
        <div className="adm-actions adm-election-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              downloadFile(`/api/admin/data/export/${stateSlug}/${year}/results`)
            }
          >
            Download {stateSlug}-{year}.json
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={deleting}
            onClick={handleDeleteElection}
          >
            {deleting ? 'Deleting…' : 'Delete this election'}
          </button>
        </div>
      )}

      {!resultsUrl && <p className="adm-empty">Pick a state and year to edit results.</p>}

      {loading && (
        <div className="spinner-wrap">
          <div className="spinner" aria-label="Loading results" />
        </div>
      )}
      {error && <p className="form-error">Could not load results: {error.message}</p>}

      {results && !selected && pickText.trim() !== '' && (
        <p className="adm-empty">No constituency matches — pick one from the list.</p>
      )}
      {results && !pickText && (
        <p className="adm-empty">
          {results.constituencies.length} constituencies loaded — pick one above to edit it.
        </p>
      )}

      {selected && (
        <ConstituencyEditor
          key={`${stateSlug}-${year}-${selected.ac_no}`}
          stateSlug={stateSlug}
          year={year}
          constituency={selected}
          partyOptions={partyOptions}
          notify={notify}
          onSaved={(updated) => {
            setPickText(acLabel(updated));
            refetch();
          }}
        />
      )}
    </div>
  );
}

let candSeq = 0;

function toDraft(c) {
  return {
    ac_name: c.ac_name,
    declared: !!c.declared,
    candidates: c.candidates.map((cd) => ({
      key: ++candSeq,
      candidate: cd.candidate,
      party: cd.party,
      votes: String(cd.votes),
    })),
  };
}

function ConstituencyEditor({ stateSlug, year, constituency, partyOptions, notify, onSaved }) {
  const [draft, setDraft] = useState(() => toDraft(constituency));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedResult, setSavedResult] = useState(null); // recomputed constituency

  function updateCandidate(key, patch) {
    setDraft((d) => ({
      ...d,
      candidates: d.candidates.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    }));
  }

  function removeCandidate(key) {
    setDraft((d) => ({ ...d, candidates: d.candidates.filter((c) => c.key !== key) }));
  }

  function addCandidate() {
    setDraft((d) => ({
      ...d,
      candidates: [
        ...d.candidates,
        { key: ++candSeq, candidate: '', party: '', votes: '0' },
      ],
    }));
  }

  async function handleSave() {
    setSaveError(null);
    if (!draft.ac_name.trim()) return setSaveError('Constituency name is required.');
    if (draft.candidates.length === 0) {
      return setSaveError('At least one candidate is required.');
    }
    const candidates = [];
    for (const c of draft.candidates) {
      const name = c.candidate.trim();
      const party = c.party.trim();
      const votes = Number(c.votes);
      if (!name) return setSaveError('Every candidate needs a name.');
      if (!party) return setSaveError(`Candidate ${name} needs a party code.`);
      if (!Number.isInteger(votes) || votes < 0) {
        return setSaveError(`Votes for ${name} must be a non-negative whole number.`);
      }
      candidates.push({ candidate: name, party, votes });
    }

    setSaving(true);
    try {
      const res = await api.put(
        `/api/admin/data/${stateSlug}/${year}/constituencies/${constituency.ac_no}`,
        { ac_name: draft.ac_name.trim(), declared: draft.declared, candidates }
      );
      setSavedResult(res.constituency);
      setDraft(toDraft(res.constituency));
      notify('success', `Saved #${res.constituency.ac_no} ${res.constituency.ac_name}.`);
      onSaved(res.constituency);
    } catch (err) {
      setSaveError(err.message || 'Could not save constituency');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="adm-editor">
      <p className="adm-current-winner">
        <span className="label">Current winner</span>
        {winnerLine(constituency)}
      </p>

      <div className="adm-picker-row">
        <label className="field adm-field-inline adm-field-grow">
          <span className="label">Constituency name</span>
          <input
            className="input"
            type="text"
            value={draft.ac_name}
            onChange={(e) => setDraft({ ...draft, ac_name: e.target.value })}
          />
        </label>
        <label className="adm-check adm-field-inline">
          <input
            type="checkbox"
            checked={draft.declared}
            onChange={(e) => setDraft({ ...draft, declared: e.target.checked })}
          />
          declared
        </label>
      </div>

      <div className="table-scroll">
        <table className="admin-table adm-candidates-edit">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Party code</th>
              <th className="adm-votes-col">Votes</th>
              <th className="actions-col" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {draft.candidates.map((c) => (
              <tr key={c.key}>
                <td>
                  <input
                    className="input input-cell"
                    type="text"
                    value={c.candidate}
                    onChange={(e) => updateCandidate(c.key, { candidate: e.target.value })}
                    aria-label="Candidate name"
                  />
                </td>
                <td>
                  <input
                    className="input input-cell mono"
                    type="text"
                    list="results-party-options"
                    value={c.party}
                    onChange={(e) => updateCandidate(c.key, { party: e.target.value })}
                    aria-label="Party code"
                  />
                </td>
                <td className="adm-votes-col">
                  <input
                    className="input input-cell adm-votes-input"
                    type="number"
                    min="0"
                    step="1"
                    value={c.votes}
                    onChange={(e) => updateCandidate(c.key, { votes: e.target.value })}
                    aria-label="Votes"
                  />
                </td>
                <td className="actions-col">
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => removeCandidate(c.key)}
                    aria-label="Remove candidate"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <datalist id="results-party-options">
        {partyOptions.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>

      {saveError && <p className="form-error">{saveError}</p>}
      {savedResult && (
        <p className="form-success">
          Recomputed — winner: {winnerLine(savedResult)}
        </p>
      )}

      <div className="adm-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={addCandidate}>
          Add candidate
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save constituency'}
        </button>
      </div>
    </div>
  );
}
