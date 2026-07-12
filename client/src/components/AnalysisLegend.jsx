import { MARGIN_BANDS } from '../lib/marginBands.js';
import { SWING_LEGEND, swingColor } from '../lib/swingScale.js';
import { shortPartyLabel } from '../lib/partyLabel.js';

// Legend for the margin / swing analysis modes (replaces the party legend
// while an analysis mode is active).
export default function AnalysisLegend({ analysis, swingPartyColor }) {
  if (analysis === 'margin') {
    return (
      <div className="party-legend">
        <p className="legend-caption">Victory margin</p>
        <ul className="legend-list">
          {MARGIN_BANDS.map((b) => (
            <li key={b.label} className="legend-vrow">
              <span className="legend-swatch" style={{ backgroundColor: b.color }} />
              <span className="legend-code">{b.label}</span>
            </li>
          ))}
        </ul>
        <p className="legend-note">Warmer = more contestable</p>
      </div>
    );
  }

  if (analysis?.kind === 'swing') {
    return (
      <div className="party-legend">
        <p className="legend-caption">
          {shortPartyLabel(analysis.code)} swing since {analysis.fromYear}
        </p>
        <div className="legend-bands">
          {SWING_LEGEND.stops.map((s) => (
            <div key={s.label} className="legend-band">
              <span
                className="legend-band-swatch"
                style={{ backgroundColor: swingColor(s.mag, swingPartyColor) }}
              />
              <span className="legend-band-label">{s.label}</span>
            </div>
          ))}
        </div>
        <p className="legend-note">Toward (color) vs away (slate), in points</p>
      </div>
    );
  }

  return null;
}
