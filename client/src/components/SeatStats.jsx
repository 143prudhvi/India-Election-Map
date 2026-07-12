import { shortPartyLabel } from '../lib/partyLabel.js';
import { useCountUp } from '../hooks/useCountUp.js';

// Headline seat summary: KPI tiles for the top two parties/blocs, a full
// majority strip, and a compact "others" row. Tiles + chips are clickable to
// map that party's vote share (the old legend's role).
export default function SeatStats({ rows, totalSeats, colorFor, activeCode, onPick, partyName }) {
  const seated = (rows || []).filter((r) => r.seats > 0);
  const majority = Math.floor(totalSeats / 2) + 1;
  const leader = seated[0];
  const top = seated.slice(0, 2);
  const rest = seated.slice(2);

  return (
    <div className="seat-stats">
      <div className="stat-tiles">
        {top.map((r) => (
          <StatTile
            key={r.party}
            row={r}
            color={colorFor(r.party)}
            total={totalSeats}
            active={activeCode === r.party}
            onPick={() => onPick(r.party)}
            title={partyName ? partyName(r.party) : undefined}
          />
        ))}
      </div>

      {totalSeats > 0 && leader && (
        <div className="maj-strip">
          <div className="maj-track">
            {seated.map((r) => (
              <span
                key={r.party}
                className="maj-seg"
                style={{ width: `${(r.seats / totalSeats) * 100}%`, background: colorFor(r.party) }}
                title={`${r.party}: ${r.seats}`}
              />
            ))}
            <span className="maj-tick" style={{ left: `${(majority / totalSeats) * 100}%` }} />
          </div>
          <div className="maj-cap">
            <span className="maj-verdict">
              {leader.seats >= majority
                ? `${shortPartyLabel(leader.party)} majority · +${leader.seats - majority}`
                : `${shortPartyLabel(leader.party)} largest · ${majority - leader.seats} short`}
            </span>
            <span>{majority} for majority</span>
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="stat-others">
          {rest.slice(0, 6).map((r) => (
            <button
              key={r.party}
              type="button"
              className={activeCode === r.party ? 'chiprow active' : 'chiprow'}
              onClick={() => onPick(r.party)}
              title={partyName ? partyName(r.party) : r.party}
            >
              <span className="sw" style={{ background: colorFor(r.party) }} />
              <span className="chiprow-code">{shortPartyLabel(r.party)}</span>
              <b>{r.seats}</b>
            </button>
          ))}
          {rest.length > 6 && <span className="stat-others-more">+{rest.length - 6} more</span>}
        </div>
      )}
    </div>
  );
}

function StatTile({ row, color, total, active, onPick, title }) {
  const seats = useCountUp(row.seats);
  return (
    <button
      type="button"
      className={active ? 'stat-tile active' : 'stat-tile'}
      style={{ '--c': color }}
      onClick={onPick}
      title={title}
    >
      <span className="stat-code">{shortPartyLabel(row.party)}</span>
      <span className="stat-seats">{seats}</span>
      <span className="stat-sub">{row.vote_pct.toFixed(1)}% votes</span>
      <span className="stat-meter">
        <i style={{ width: `${Math.min((row.seats / total) * 100, 100)}%`, background: color }} />
      </span>
    </button>
  );
}
