import { shortPartyLabel } from '../lib/partyLabel.js';

export default function PartyLegend({
  mode,
  parties,
  partyColor,
  shareMax,
  totalSeats,
  onPartyClick,
}) {
  if (mode !== 'winner') {
    const color = partyColor(mode);
    const max = shareMax > 0 ? shareMax : 1;
    return (
      <div className="party-legend">
        <p className="legend-caption" title={mode}>
          {shortPartyLabel(mode)} vote share
        </p>
        <div
          className="legend-gradient"
          style={{ background: `linear-gradient(to right, #ffffff, ${color})` }}
        />
        <div className="legend-gradient-labels">
          <span>0%</span>
          <span>{max.toFixed(1)}%</span>
        </div>
        <button type="button" className="legend-back" onClick={() => onPartyClick('winner')}>
          ← Back to winners
        </button>
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
              <span className="legend-main">
                <span className="legend-top">
                  <span className="legend-code" title={p.party}>
                    {shortPartyLabel(p.party)}
                  </span>
                  <span className="legend-seats">{p.seats}</span>
                </span>
                <span className="legend-bar-track">
                  <span
                    className="legend-bar"
                    style={{
                      width: `${Math.max((p.seats / denominator) * 100, p.seats > 0 ? 1.5 : 0)}%`,
                      backgroundColor: partyColor(p.party),
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="legend-hint">Click a party to map its vote share</p>
    </div>
  );
}
