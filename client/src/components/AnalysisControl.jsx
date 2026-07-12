import { shortPartyLabel } from '../lib/partyLabel.js';

// Toolbar control for the Pro analysis map modes. Emits an `analysis`
// descriptor: null (off) | 'margin' | { kind: 'swing', code, fromYear }.
export default function AnalysisControl({
  analysis,
  parties, // notable parties/blocs available to track for swing
  otherYears, // years of this state other than the selected one
  isPro,
  onChange,
  onUpgrade,
}) {
  const kind = analysis === 'margin' ? 'margin' : analysis?.kind === 'swing' ? 'swing' : 'off';

  function handleKind(next) {
    if (!isPro && next !== 'off') {
      onUpgrade();
      return;
    }
    if (next === 'off') onChange(null);
    else if (next === 'margin') onChange('margin');
    else {
      const code = parties[0]?.party;
      const fromYear = otherYears[0];
      if (code && fromYear != null) onChange({ kind: 'swing', code, fromYear });
    }
  }

  return (
    <div className="analysis-control">
      <label className="picker-field">
        <span className="label">
          Analysis {!isPro && <span className="pro-tag">PRO</span>}
        </span>
        <select
          className="select"
          value={kind}
          onChange={(e) => handleKind(e.target.value)}
        >
          <option value="off">Winner / vote share</option>
          <option value="margin">Marginal seats</option>
          <option value="swing" disabled={otherYears.length === 0}>
            Swing vs…
          </option>
        </select>
      </label>

      {kind === 'swing' && analysis?.kind === 'swing' && (
        <>
          <label className="picker-field">
            <span className="label">Party</span>
            <select
              className="select"
              value={analysis.code}
              onChange={(e) => onChange({ ...analysis, code: e.target.value })}
            >
              {parties.map((p) => (
                <option key={p.party} value={p.party}>
                  {shortPartyLabel(p.party)}
                </option>
              ))}
            </select>
          </label>
          <label className="picker-field">
            <span className="label">vs year</span>
            <select
              className="select"
              value={analysis.fromYear}
              onChange={(e) => onChange({ ...analysis, fromYear: Number(e.target.value) })}
            >
              {otherYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
