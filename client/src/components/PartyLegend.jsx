import * as d3 from 'd3';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { SHARE_BANDS } from '../lib/shareBands.js';

export default function PartyLegend({
  mode,
  parties,
  partyColor,
  totalSeats,
  onPartyClick,
}) {
  if (mode !== 'winner') {
    const ramp = d3.interpolateRgb('#ffffff', partyColor(mode));
    return (
      <div className="party-legend">
        <p className="legend-caption" title={mode}>
          {shortPartyLabel(mode)} vote share
        </p>
        <div className="legend-bands">
          {SHARE_BANDS.map((b) => (
            <div key={b.label} className="legend-band">
              <span className="legend-band-swatch" style={{ backgroundColor: ramp(b.t) }} />
              <span className="legend-band-label">{b.label.replace('%', '')}</span>
            </div>
          ))}
        </div>
        <p className="legend-note">White — no votes / did not contest</p>
      </div>
    );
  }

  const denominator = totalSeats > 0 ? totalSeats : 1;

  return (
    <div className="party-legend">
      <ul className="legend-list">
        {(parties || []).map((p) => (
          <li key={p.party}>
            <button
              type="button"
              className="legend-row"
              title={`Show ${p.party} vote share`}
              onClick={() => onPartyClick(p.party)}
            >
              <span
                className="legend-swatch"
                style={{ backgroundColor: partyColor(p.party) }}
              />
              <span className="legend-code" title={p.party}>
                {shortPartyLabel(p.party)}
              </span>
              <span className="legend-bar">
                <span
                  className="legend-bar-fill"
                  style={{
                    width: `${Math.min((p.seats / denominator) * 100, 100)}%`,
                    backgroundColor: partyColor(p.party),
                  }}
                />
              </span>
              <span className="legend-seats">{p.seats}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="legend-hint">Click a party to map its vote share</p>
    </div>
  );
}
