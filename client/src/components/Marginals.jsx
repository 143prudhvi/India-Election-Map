import { useMemo, useState } from 'react';
import PartyChip from './PartyChip.jsx';
import { shortPartyLabel } from '../lib/partyLabel.js';
import { MARGIN_BANDS } from '../lib/marginBands.js';

const KNIFE_LIMIT = 8;
const SPOILER_LIMIT = 6;
const RISK_LIMIT = 8;
const FLIP_THRESHOLDS = [2, 5];

function formatVotes(n) {
  return n == null ? '—' : n.toLocaleString('en-IN');
}

// The margin-mode sidebar: turns the coloured map into countable stakes — the
// tightest seats, which are decided by a spoiler, how exposed each party is,
// and what happens to the tally if the marginals flip. All derived from the
// already-loaded results; view-aware (party vs alliance) via `groupRows`.
export default function Marginals({
  constituencies,
  groupRows,
  totalSeats,
  view,
  colorFor,
  partyColor,
  partyName,
  allianceOfParty,
  onSelect,
}) {
  const seats = useMemo(
    () => (constituencies || []).filter((c) => c.winner && c.margin_pct != null),
    [constituencies]
  );

  // Winner/runner-up reduced to the code the current view groups by.
  const codeOf = useMemo(
    () => (cand, isWinner) => {
      if (!cand) return null;
      if (view !== 'alliances') return cand.party;
      if (isWinner && cand.alliance) return cand.alliance;
      return allianceOfParty?.get(cand.party)?.alliance ?? 'OTH';
    },
    [view, allianceOfParty]
  );

  const majority = Math.floor(totalSeats / 2) + 1;

  // #4 — tightest seats
  const knife = useMemo(
    () => seats.slice().sort((a, b) => a.margin_pct - b.margin_pct).slice(0, KNIFE_LIMIT),
    [seats]
  );
  const knifeMax = Math.max(5, ...knife.map((c) => c.margin_pct));
  const ultraCount = seats.filter((c) => c.margin_pct < MARGIN_BANDS[0].upTo).length;

  // #5 — seats a third candidate could have swung (3rd-place votes > margin)
  const spoilers = useMemo(
    () =>
      seats
        .filter((c) => {
          const third = c.candidates?.[2];
          return third && c.margin != null && third.votes > c.margin;
        })
        .sort((a, b) => a.margin_pct - b.margin_pct),
    [seats]
  );

  // #6 — each party's won seats split into contestability bands
  const risk = useMemo(() => {
    const map = new Map();
    for (const c of seats) {
      const code = codeOf(c.winner, true);
      if (!code) continue;
      if (!map.has(code)) map.set(code, { code, total: 0, bands: MARGIN_BANDS.map(() => 0) });
      const e = map.get(code);
      e.total += 1;
      let bi = MARGIN_BANDS.findIndex((b) => c.margin_pct < b.upTo);
      if (bi === -1) bi = MARGIN_BANDS.length - 1;
      e.bands[bi] += 1;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [seats, codeOf]);

  // #7 — flip every seat under the threshold to its runner-up
  const [thr, setThr] = useState(5);
  const flip = useMemo(() => {
    const flipping = seats.filter((c) => c.margin_pct < thr && c.runner_up);
    const before = new Map(groupRows.map((r) => [r.party, r.seats]));
    const after = new Map(before);
    const flowMap = new Map(); // "from|to" -> count (gross seats changing hands)
    for (const c of flipping) {
      const w = codeOf(c.winner, true);
      const r = codeOf(c.runner_up, false);
      if (w == null || r == null || w === r) continue; // skip intra-bloc friendly fights
      after.set(w, (after.get(w) ?? 0) - 1);
      after.set(r, (after.get(r) ?? 0) + 1);
      const key = `${w}|${r}`;
      flowMap.set(key, (flowMap.get(key) ?? 0) + 1);
    }
    const afterRows = [...after.entries()]
      .map(([code, s]) => ({ code, seats: s }))
      .filter((r) => r.seats > 0)
      .sort((a, b) => b.seats - a.seats);
    const flows = [...flowMap.entries()]
      .map(([k, n]) => {
        const [from, to] = k.split('|');
        return { from, to, n };
      })
      .sort((a, b) => b.n - a.n);
    return { count: flipping.length, afterRows, flows, leader: afterRows[0] };
  }, [seats, thr, groupRows, codeOf]);

  const pick = (c) => onSelect?.({ acNo: c.ac_no, acName: c.ac_name });
  const label = (code) => (view === 'alliances' ? code : shortPartyLabel(code));

  if (seats.length === 0) {
    return (
      <div className="card sidebar-card">
        <p className="legend-hint">No margin data for this election.</p>
      </div>
    );
  }

  return (
    <>
      {/* #4 knife-edge */}
      <div className="card sidebar-card">
        <h3 className="sidebar-heading-sm">
          Knife-edge seats
          <span className="heading-count">{ultraCount} under 5%</span>
        </h3>
        <div className="mg-list">
          {knife.map((c) => {
            const w = codeOf(c.winner, true);
            const r = codeOf(c.runner_up, false);
            return (
              <button type="button" className="mg-row" key={c.ac_no} onClick={() => pick(c)}>
                <span className="mg-main">
                  <span className="mg-seat">{c.ac_name}</span>
                  <span className="mg-tags">
                    <PartyChip code={w} color={colorFor(w)} title={partyName(c.winner.party)} />
                    <span className="mg-arrow">›</span>
                    {r && (
                      <PartyChip
                        code={r}
                        color={colorFor(r)}
                        title={partyName(c.runner_up.party)}
                      />
                    )}
                  </span>
                </span>
                <span className="mg-val">
                  <span className="mg-pct">{c.margin_pct}%</span>
                  <span className="mg-sub">{formatVotes(c.margin)}</span>
                </span>
                <span
                  className="mg-bar"
                  style={{ width: `${(c.margin_pct / knifeMax) * 100}%`, background: colorFor(w) }}
                />
              </button>
            );
          })}
        </div>
        <p className="legend-note">Tightest margins first · tap to open the seat</p>
      </div>

      {/* #7 flip-watch */}
      <div className="card sidebar-card">
        <div className="mg-flip-head">
          <h3 className="sidebar-heading-sm">If the marginals flip</h3>
          <span className="mg-thr-group" role="group" aria-label="Flip threshold">
            {FLIP_THRESHOLDS.map((t) => (
              <button
                key={t}
                type="button"
                className={thr === t ? 'mg-thr on' : 'mg-thr'}
                onClick={() => setThr(t)}
              >
                &lt;{t}%
              </button>
            ))}
          </span>
        </div>
        <p className="mg-note">
          {flip.count === 0
            ? `No seats decided by under ${thr}%.`
            : `${flip.count} ${flip.count === 1 ? 'seat' : 'seats'} decided by under ${thr}%. If each flipped to its runner-up:`}
        </p>
        {flip.count > 0 && (
          <>
            <div className="maj-strip">
              <div className="maj-track">
                {flip.afterRows.map((r) => (
                  <span
                    key={r.code}
                    className="maj-seg"
                    style={{ width: `${(r.seats / totalSeats) * 100}%`, background: colorFor(r.code) }}
                    title={`${label(r.code)}: ${r.seats}`}
                  />
                ))}
                <span className="maj-tick" style={{ left: `${(majority / totalSeats) * 100}%` }} />
              </div>
              <div className="maj-cap">
                <span className="maj-verdict">
                  {flip.leader && flip.leader.seats >= majority
                    ? `${label(flip.leader.code)} majority · +${flip.leader.seats - majority}`
                    : flip.leader
                      ? `hung — ${label(flip.leader.code)} largest · ${majority - flip.leader.seats} short`
                      : ''}
                </span>
                <span>{majority} for majority</span>
              </div>
            </div>
            <p className="mg-flows-label">Seats changing hands</p>
            <div className="mg-flows">
              {flip.flows.map((f) => (
                <div className="mg-flow" key={`${f.from}-${f.to}`}>
                  <PartyChip code={f.from} color={colorFor(f.from)} title={partyName(f.from)} />
                  <span className="mg-arrow">›</span>
                  <PartyChip code={f.to} color={colorFor(f.to)} title={partyName(f.to)} />
                  <b className="mg-flow-n">{f.n}</b>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* #6 seats at risk */}
      <div className="card sidebar-card">
        <h3 className="sidebar-heading-sm">Seats at risk</h3>
        <div className="mg-risk">
          {risk.slice(0, RISK_LIMIT).map((row) => {
            const tight = row.bands[0] + row.bands[1]; // under 10%
            return (
              <div className="mg-risk-row" key={row.code}>
                <span className="mg-risk-label">
                  <PartyChip code={row.code} color={colorFor(row.code)} title={partyName(row.code)} />
                  <b>{row.total}</b>
                </span>
                <span className="mg-stack" aria-hidden="true">
                  {row.bands.map((n, i) =>
                    n > 0 ? (
                      <span
                        key={i}
                        className="mg-seg"
                        style={{ width: `${(n / row.total) * 100}%`, background: MARGIN_BANDS[i].color }}
                        title={`${MARGIN_BANDS[i].label}: ${n}`}
                      />
                    ) : null
                  )}
                </span>
                <span className={tight > 0 ? 'mg-tight hot' : 'mg-tight'}>{tight} tight</span>
              </div>
            );
          })}
        </div>
        <p className="legend-note">
          <span className="mg-legend-sw" style={{ background: MARGIN_BANDS[0].color }} />
          &lt;5%
          <span className="mg-legend-sw" style={{ background: MARGIN_BANDS[1].color }} />
          5–10%
          <span className="mg-legend-sw" style={{ background: MARGIN_BANDS[2].color }} />
          10–20%
          <span className="mg-legend-sw" style={{ background: MARGIN_BANDS[3].color }} />
          safe · “tight” = under 10%
        </p>
      </div>

      {/* #5 spoilers */}
      <div className="card sidebar-card">
        <h3 className="sidebar-heading-sm">
          Spoiler seats
          <span className="heading-count">{spoilers.length}</span>
        </h3>
        {spoilers.length === 0 ? (
          <p className="legend-hint">No seat where a third candidate outpolled the winning margin.</p>
        ) : (
          <>
            <div className="mg-list">
              {spoilers.slice(0, SPOILER_LIMIT).map((c) => {
                const w = codeOf(c.winner, true);
                const r = codeOf(c.runner_up, false);
                const third = c.candidates[2];
                return (
                  <button type="button" className="mg-row" key={c.ac_no} onClick={() => pick(c)}>
                    <span className="mg-main">
                      <span className="mg-seat">{c.ac_name}</span>
                      <span className="mg-tags">
                        <PartyChip code={w} color={colorFor(w)} title={partyName(c.winner.party)} />
                        <span className="mg-arrow">›</span>
                        {r && (
                          <PartyChip code={r} color={colorFor(r)} title={partyName(c.runner_up.party)} />
                        )}
                      </span>
                      <span className="mg-spoil">
                        3rd&nbsp;
                        <span className="sw" style={{ background: partyColor(third.party) }} />
                        {shortPartyLabel(third.party)} {formatVotes(third.votes)} &gt; margin{' '}
                        {formatVotes(c.margin)}
                      </span>
                    </span>
                    <span className="mg-val">
                      <span className="mg-pct">{c.margin_pct}%</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="legend-note">Third-place vote exceeded the victory margin</p>
          </>
        )}
      </div>
    </>
  );
}
