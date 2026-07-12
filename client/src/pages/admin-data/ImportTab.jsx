import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../hooks/useApi.js';

export default function ImportTab({ notify }) {
  const { data: states, error: statesError, refetch: refetchStates } = useApi('/api/data/states');

  const [stateSlug, setStateSlug] = useState('');
  const [year, setYear] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [importError, setImportError] = useState(null);
  const [report, setReport] = useState(null); // {constituencies, unknown_parties}
  const [importing, setImporting] = useState(false);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setImportError(null);
    setReport(null);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.onerror = () => setImportError('Could not read the file.');
    reader.readAsText(file);
  }

  async function handleImport(e) {
    e.preventDefault();
    setImportError(null);
    setReport(null);

    if (!stateSlug) return setImportError('Pick a state.');
    const y = Number(year);
    if (!/^\d{4}$/.test(String(year)) || y < 1950 || y > 2100) {
      return setImportError('Year must be a 4-digit year between 1950 and 2100.');
    }
    if (!text.trim()) return setImportError('Choose a .json file or paste the results JSON.');

    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      return setImportError('That is not valid JSON.');
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return setImportError(
        'Expected a non-empty JSON array of constituency rows ([{ac_no, ac_name, candidates:[…]}]).'
      );
    }

    setImporting(true);
    try {
      const res = await api.post(`/api/admin/data/${stateSlug}/${y}`, rows);
      setReport(res);
      notify('success', `Imported ${res.constituencies} constituencies into ${stateSlug} ${y}.`);
      refetchStates();
    } catch (err) {
      // 409 (already exists) and 400 (bad rows) both land here.
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <form className="card" onSubmit={handleImport}>
      <h2 className="card-title">Import election</h2>
      <p className="card-hint">
        Upload or paste raw results JSON — an array of{' '}
        <span className="mono">{'{ac_no, ac_name, candidates:[{Candidate, Party, "Total Votes"}]}'}</span>{' '}
        rows. Re-importing an existing election requires deleting it first (Results tab).
      </p>

      {statesError && <p className="form-error">Could not load states: {statesError.message}</p>}

      <div className="adm-picker-row">
        <label className="field adm-field-inline">
          <span className="label">State</span>
          <select
            className="select"
            value={stateSlug}
            onChange={(e) => setStateSlug(e.target.value)}
          >
            <option value="">Select state…</option>
            {(states || []).map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field adm-field-inline">
          <span className="label">Year</span>
          <input
            className="input adm-year-input"
            type="number"
            min="1950"
            max="2100"
            placeholder="2024"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </label>
        <label className="field adm-field-inline">
          <span className="label">Results file</span>
          <input
            className="adm-file-input"
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
          />
        </label>
      </div>

      <label className="field">
        <span className="label">
          {fileName ? `JSON (from ${fileName} — editable)` : 'Or paste JSON'}
        </span>
        <textarea
          className="input import-textarea"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setReport(null);
          }}
          placeholder='[{"ac_no": 1, "ac_name": "…", "candidates": [{"Candidate": "…", "Party": "…", "Total Votes": 12345}]}]'
          spellCheck={false}
        />
      </label>

      {importError && <p className="form-error">{importError}</p>}

      <div className="adm-actions">
        <button className="btn btn-primary" type="submit" disabled={importing}>
          {importing ? 'Importing…' : 'Import'}
        </button>
      </div>

      {report && (
        <div className="adm-import-report">
          <p className="form-success">
            Imported {report.constituencies} constituencies into {stateSlug} {year}.
          </p>
          {report.unknown_parties && report.unknown_parties.length > 0 ? (
            <>
              <p className="adm-more">
                {report.unknown_parties.length} unknown part
                {report.unknown_parties.length === 1 ? 'y was' : 'ies were'} auto-registered
                in grey — give them proper colors (or merge them via aliases) in the
                Parties tab:
              </p>
              <div className="tag-list">
                {report.unknown_parties.map((name) => (
                  <span key={name} className="tag-chip">
                    {name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="adm-more">All party names matched the registry.</p>
          )}
        </div>
      )}
    </form>
  );
}
