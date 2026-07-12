import * as d3 from 'd3';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { SHARE_BANDS } from '../lib/shareBands.js';

export default function PartyLegend({
  mode, // 'winner' | party/alliance code (share mode)
  parties,
  partyColor,
  totalSeats,
  onPartyClick,
  onBack, // -> return to winner mode
}) {
  const shareMode = mode !== 'winner';
  const denominator = totalSeats > 0 ? totalSeats : 1;

  return (
    <div className="party-legend">
      {shareMode && (
        <>
          <div className="legend-caption-row">
            <p className="legend-caption" title={mode}>
              {shortPartyLabel(mode)} vote share
            </p>
            <button type="button" className="legend-back" onClick={onBack}>
              ‹ Winner map
            </button>
          </div>
          <div className="legend-bands">
            {SHARE_BANDS.map((b) => (
              <div key={b.label} className="legend-band">
                <span
                  className="legend-band-swatch"
                  style={{
                    backgroundColor: d3.interpolateRgb('#ffffff', partyColor(mode))(b.t),
                  }}
                />
                <span className="legend-band-label">{b.label.replace('%', '')}</span>
              </div>
            ))}
          </div>
          <p className="legend-note">White — no votes / did not contest</p>
        </>
      )}

      <ul className="legend-list">
        {(parties || []).map((p) => {
          const active = shareMode && p.party === mode;
          return (
            <li key={p.party}>
              <button
                type="button"
                className={active ? 'legend-row active' : 'legend-row'}
                title={
                  active ? 'Currently mapped' : `Show ${p.party} vote share`
                }
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
          );
        })}
      </ul>
      <p className="legend-hint">
        {shareMode
          ? 'Click another party to map its vote share'
          : 'Click a party to map its vote share'}
      </p>
    </div>
  );
}
