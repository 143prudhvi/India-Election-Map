import { useMemo, useState } from 'react';
import PartyChip from './PartyChip.jsx';
import { shortPartyLabel } from '../lib/partyLabel.js';

// Pro: uniform-swing seat projector. The user nudges parties up/down by a
// number of points; every constituency's winner is recomputed as the argmax
// of adjusted vote shares (standard uniform-swing model — no renormalization
// needed since only the ordering matters).
export default function WhatIfPanel({ results, parties, partyColor, partyName, onClose }) {
  const [swings, setSwings] = useState({}); // partyCode -> delta points

  const actualSeats = useMemo(() => {
    const m = new Map();
    parties.forEach((p) => m.set(p.party, p.seats));
    return m;
  }, [parties]);

  const projected = useMemo(() => {
    const tally = new Map();
    for (const c of results?.constituencies || []) {
      let best = null;
      for (const cand of c.candidates || []) {
        const adj = (cand.vote_pct || 0) + (swings[cand.party] || 0);
        if (!best || adj > best.adj) best = { party: cand.party, adj };
      }
      if (best) tally.set(best.party, (tally.get(best.party) || 0) + 1);
    }
    return tally;
  }, [results, swings]);

  const rows = useMemo(() => {
    const codes = new Set([...actualSeats.keys(), ...projected.keys(), ...Object.keys(swings)]);
    return [...codes]
      .map((party) => ({
        party,
        actual: actualSeats.get(party) || 0,
        proj: projected.get(party) || 0,
      }))
      .filter((r) => r.actual > 0 || r.proj > 0 || swings[r.party])
      .sort((a, b) => b.proj - a.proj || b.actual - a.actual);
  }, [actualSeats, projected, swings]);

  const swingable = parties.filter((p) => p.seats > 0 || p.vote_pct >= 1);

  function setSwing(code, val) {
    setSwings((s) => {
      const next = { ...s };
      if (!val || Number(val) === 0) delete next[code];
      else next[code] = Number(val);
      return next;
    });
  }

  return (
    <div className="card sidebar-card whatif-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">What-if projection</h2>
          <p className="panel-subtitle">Uniform swing across all seats</p>
        </div>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="whatif-controls">
        {swingable.map((p) => (
          <div key={p.party} className="whatif-row">
            <PartyChip code={p.party} color={partyColor(p.party)} title={partyName(p.party)} />
            <input
              type="range"
              min="-15"
              max="15"
              step="0.5"
              value={swings[p.party] || 0}
              onChange={(e) => setSwing(p.party, e.target.value)}
              className="whatif-slider"
            />
            <span className="whatif-delta">
              {swings[p.party] > 0 ? '+' : ''}
              {swings[p.party] || 0}
            </span>
          </div>
        ))}
      </div>

      <table className="summary-table whatif-table">
        <thead>
          <tr>
            <th>Party</th>
            <th className="num">Now</th>
            <th className="num">Projected</th>
            <th className="num">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.proj - r.actual;
            return (
              <tr key={r.party}>
                <td>{shortPartyLabel(r.party)}</td>
                <td className="num">{r.actual}</td>
                <td className="num">
                  <strong>{r.proj}</strong>
                </td>
                <td className={`num ${d > 0 ? 'delta-up' : d < 0 ? 'delta-down' : ''}`}>
                  {d > 0 ? `+${d}` : d}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        className="btn btn-secondary btn-sm btn-block"
        onClick={() => setSwings({})}
        disabled={Object.keys(swings).length === 0}
      >
        Reset
      </button>
    </div>
  );
}
