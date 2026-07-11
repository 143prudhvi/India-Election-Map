export default function PartyLegend({ mode, parties, partyColor, shareMax, onPartyClick }) {
  if (mode !== 'winner') {
    const color = partyColor(mode);
    const max = shareMax > 0 ? shareMax : 1;
    return (
      <div className="party-legend">
        <p className="legend-caption">{mode} vote share</p>
        <div
          className="legend-gradient"
          style={{ background: `linear-gradient(to right, #ffffff, ${color})` }}
        />
        <div className="legend-gradient-labels">
          <span>0%</span>
          <span>{max.toFixed(1)}%</span>
        </div>
      </div>
    );
  }

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
              <span className="legend-code">{p.party}</span>
              <span className="legend-seats">{p.seats}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="legend-hint">Click a party to map its vote share</p>
    </div>
  );
}
