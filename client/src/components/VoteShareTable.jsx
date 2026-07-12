import PartyChip from './PartyChip.jsx';

// Dual-bar breakdown: each row shows seats + an overlaid seat-share (top,
// solid) vs vote-share (bottom, lighter) bar on a shared 0–100% scale, so the
// "few % of votes → many seats" amplification is visible at a glance. Rows are
// clickable to map that party/bloc's vote share.
function DualBars({ seatPct, votePct, color }) {
  return (
    <span className="dual-bars" aria-hidden="true">
      <span className="dual-bar">
        <i style={{ width: `${Math.min(seatPct, 100)}%`, background: color }} />
      </span>
      <span className="dual-bar">
        <i style={{ width: `${Math.min(votePct, 100)}%`, background: color, opacity: 0.5 }} />
      </span>
    </span>
  );
}

export default function VoteShareTable({
  view,
  parties,
  alliances,
  totalSeats,
  colorFor,
  partyColor,
  partyName,
  activeCode,
  onPick,
}) {
  const isAlliance = view === 'alliances';
  const rows = isAlliance ? alliances : parties;

  return (
    <table className="vote-table">
      <thead>
        <tr>
          <th>{isAlliance ? 'Alliance / party' : 'Party'}</th>
          <th className="n">Seats</th>
          <th className="dual-col">Seats · votes</th>
          <th className="n">Votes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const code = isAlliance ? row.alliance : row.party;
          const clickable = !(isAlliance && code === 'OTH');
          const seatPct = totalSeats > 0 ? (row.seats / totalSeats) * 100 : 0;
          return (
            <RowGroup
              key={code}
              row={row}
              code={code}
              isAlliance={isAlliance}
              seatPct={seatPct}
              totalSeats={totalSeats}
              color={isAlliance ? colorFor(code) : partyColor(code)}
              clickable={clickable}
              active={activeCode === code}
              onPick={() => clickable && onPick(code)}
              partyColor={partyColor}
              partyName={partyName}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function RowGroup({ row, code, isAlliance, seatPct, totalSeats, color, clickable, active, onPick, partyColor, partyName }) {
  const rowClass = [
    isAlliance ? 'alliance-line' : 'party-line',
    clickable ? 'clickable' : '',
    active ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <tr className={rowClass} onClick={clickable ? onPick : undefined}>
        <td>
          {isAlliance ? (
            <span className="alliance-cell">
              <span className="sw" style={{ background: color }} />
              <span title={row.name}>{code}</span>
            </span>
          ) : (
            <PartyChip code={code} color={color} title={partyName(code)} />
          )}
        </td>
        <td className="n seats-cell">{row.seats}</td>
        <td>
          <DualBars seatPct={seatPct} votePct={row.vote_pct} color={color} />
        </td>
        <td className="n">{row.vote_pct.toFixed(2)}%</td>
      </tr>
      {isAlliance &&
        (row.parties || []).length > 1 &&
        (row.parties || []).map((p) => (
          <tr key={p.party} className="member-line">
            <td>
              <PartyChip code={p.party} color={partyColor(p.party)} title={partyName(p.party)} />
            </td>
            <td className="n">{p.seats}</td>
            <td>
              <DualBars
                seatPct={totalSeats > 0 ? (p.seats / totalSeats) * 100 : 0}
                votePct={p.vote_pct}
                color={partyColor(p.party)}
              />
            </td>
            <td className="n">{p.vote_pct.toFixed(2)}%</td>
          </tr>
        ))}
    </>
  );
}
