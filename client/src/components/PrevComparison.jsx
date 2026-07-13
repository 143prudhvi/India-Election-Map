import { useMemo } from 'react';
import { shortPartyLabel } from '../lib/partyLabel.js';

// Pro: how this election moved versus the previous one for the same state —
// seat swing per party, vote-share swing, how many seats changed hands, and how
// control of the house shifted. Party-level (the stable unit across years, even
// when alliances re-form). Shown only when the "vs {year}" toggle is on.
export default function PrevComparison({ curr, prev, prevYear, partyColor, partyName }) {
  const total = curr.summary.total_seats;
  const majority = Math.floor(total / 2) + 1;

  const rows = useMemo(() => {
    const prevSeat = new Map();
    const prevVote = new Map();
    (prev.summary.parties || []).forEach((p) => {
      prevSeat.set(p.party, p.seats);
      prevVote.set(p.party, p.vote_pct);
    });
    return (curr.summary.parties || [])
      .map((p) => {
        const prevSeats = prevSeat.get(p.party) ?? 0;
        const prevVotePct = prevVote.get(p.party) ?? 0;
        return {
          party: p.party,
          currSeats: p.seats,
          prevSeats,
          dSeats: p.seats - prevSeats,
          currVote: p.vote_pct,
          dVote: Math.round((p.vote_pct - prevVotePct) * 10) / 10,
        };
      })
      .filter((r) => r.currSeats > 0 || r.prevSeats > 0 || r.currVote >= 1)
      .sort((a, b) => b.currSeats - a.currSeats || b.prevSeats - a.prevSeats);
  }, [curr, prev]);

  const flips = useMemo(() => {
    const prevWinner = new Map();
    (prev.constituencies || []).forEach((c) => {
      if (c.winner) prevWinner.set(c.ac_no, c.winner.party);
    });
    let flipped = 0;
    let compared = 0;
    (curr.constituencies || []).forEach((c) => {
      if (!c.winner) return;
      const pw = prevWinner.get(c.ac_no);
      if (pw == null) return;
      compared += 1;
      if (pw !== c.winner.party) flipped += 1;
    });
    return { flipped, compared };
  }, [curr, prev]);

  const leaders = useMemo(() => {
    const bySeats = (list) => [...(list || [])].sort((a, b) => b.seats - a.seats)[0] || null;
    return { curr: bySeats(curr.summary.parties), prev: bySeats(prev.summary.parties) };
  }, [curr, prev]);

  const status = (seats) => (seats >= majority ? 'majority' : 'largest');
  const top = rows.slice(0, 2);
  const topSet = new Set(top.map((r) => r.party));
  const rest = rows.filter((r) => !topSet.has(r.party) && r.dSeats !== 0).slice(0, 6);

  return (
    <div className="card sidebar-card">
      <h3 className="sidebar-heading-sm">
        Change vs {prevYear}
        <span className="heading-count">prev. election</span>
      </h3>

      {leaders.curr && leaders.prev && (
        <p className="cmp-verdict">
          <b style={{ color: partyColor(leaders.prev.party) }}>
            {shortPartyLabel(leaders.prev.party)}
          </b>{' '}
          {status(leaders.prev.seats)}
          <span className="cmp-arrow" aria-hidden="true">
            →
          </span>
          <b style={{ color: partyColor(leaders.curr.party) }}>
            {shortPartyLabel(leaders.curr.party)}
          </b>{' '}
          {status(leaders.curr.seats)}
        </p>
      )}

      <div className="cmp-tiles">
        {top.map((r) => (
          <div className="cmp-tile" key={r.party} style={{ '--c': partyColor(r.party) }} title={partyName(r.party)}>
            <span className="cmp-code">{shortPartyLabel(r.party)}</span>
            <span className={`cmp-delta ${r.dSeats > 0 ? 'cmp-up' : r.dSeats < 0 ? 'cmp-down' : ''}`}>
              {r.dSeats > 0 ? `+${r.dSeats}` : r.dSeats} <span className="cmp-delta-unit">seats</span>
            </span>
            <span className="cmp-sub">
              {r.currSeats} now · was {r.prevSeats}
            </span>
            <span className={`cmp-swing ${r.dVote > 0 ? 'cmp-up' : r.dVote < 0 ? 'cmp-down' : ''}`}>
              {r.dVote > 0 ? '+' : ''}
              {r.dVote} pts vote
            </span>
          </div>
        ))}
      </div>

      <div className="cmp-flip">
        <span className="cmp-flip-n">{flips.flipped}</span>
        <span className="cmp-flip-lbl">
          of {flips.compared} seats changed party
        </span>
        <span className="cmp-flip-bar" aria-hidden="true">
          <i style={{ width: `${flips.compared ? (flips.flipped / flips.compared) * 100 : 0}%` }} />
        </span>
      </div>

      {rest.length > 0 && (
        <div className="cmp-others">
          {rest.map((r) => (
            <span className="cmp-chip" key={r.party} title={partyName(r.party)}>
              <span className="sw" style={{ background: partyColor(r.party) }} />
              {shortPartyLabel(r.party)}
              <b className={r.dSeats > 0 ? 'cmp-up' : 'cmp-down'}>
                {r.dSeats > 0 ? `+${r.dSeats}` : r.dSeats}
              </b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
