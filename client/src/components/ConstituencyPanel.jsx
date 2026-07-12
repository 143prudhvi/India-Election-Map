import { useRef, useState } from 'react';
import PartyChip from './PartyChip.jsx';
import AllianceChip from './AllianceChip.jsx';
import { displayName } from '../lib/formatName.js';
import { useTip } from '../hooks/useTip.jsx';

function formatVotes(n) {
  return n == null ? '—' : n.toLocaleString('en-IN');
}

// One line with an ellipsis; the styled tooltip appears only when the name
// is actually truncated.
function CandidateName({ name, bold, tip }) {
  const ref = useRef(null);
  const display = displayName(name);
  const truncated = () => {
    const el = ref.current;
    return el && el.scrollWidth > el.clientWidth + 1;
  };
  return (
    <span
      ref={ref}
      className={bold ? 'candidate-name candidate-name-bold' : 'candidate-name'}
      onMouseEnter={(e) => truncated() && tip.show(display, e)}
      onMouseMove={tip.move}
      onMouseLeave={tip.hide}
    >
      {display}
    </span>
  );
}

export default function ConstituencyPanel({
  acNo,
  acName,
  constituency,
  partyColor,
  partyName,
  allianceOfParty, // Map(party code -> alliance summary row), empty when no alliances
  onClose,
}) {
  const winner = constituency?.winner;
  const runnerUp = constituency?.runner_up;
  const nameTip = useTip();
  const allianceTip = useTip();
  const winnerAlliance = winner ? allianceOfParty?.get(winner.party) : null;

  return (
    <div className="card sidebar-card constituency-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{acName}</h2>
          <p className="panel-subtitle">Constituency #{acNo}</p>
        </div>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      {!constituency ? (
        <p className="panel-empty">No result data for this constituency.</p>
      ) : (
        <>
          {constituency.declared === false && (
            <p className="badge badge-warn">Result not declared</p>
          )}

          {winner && (
            <>
              <div className={runnerUp ? 'h2h' : 'h2h h2h-solo'}>
                <div className="h2h-side win" style={{ borderColor: partyColor(winner.party) }}>
                  <div className="h2h-tag">WON</div>
                  <div className="h2h-chips">
                    <PartyChip
                      code={winner.party}
                      color={partyColor(winner.party)}
                      title={partyName(winner.party)}
                    />
                    {winnerAlliance && (
                      <AllianceChip
                        code={winnerAlliance.alliance}
                        color={winnerAlliance.color}
                        name={winnerAlliance.name}
                      />
                    )}
                  </div>
                  <div className="h2h-who" title={displayName(winner.candidate)}>
                    {displayName(winner.candidate)}
                  </div>
                  <div className="h2h-pct">{winner.vote_pct}%</div>
                </div>

                {runnerUp && (
                  <>
                    <div className="h2h-vs">vs</div>
                    <div className="h2h-side">
                      <div className="h2h-tag">RUNNER-UP</div>
                      <div className="h2h-chips">
                        <PartyChip
                          code={runnerUp.party}
                          color={partyColor(runnerUp.party)}
                          title={partyName(runnerUp.party)}
                        />
                      </div>
                      <div className="h2h-who" title={displayName(runnerUp.candidate)}>
                        {displayName(runnerUp.candidate)}
                      </div>
                      <div className="h2h-pct">{runnerUp.vote_pct}%</div>
                    </div>
                  </>
                )}
              </div>

              {runnerUp && (
                <>
                  <div className="tug" aria-hidden="true">
                    <span
                      style={{ width: `${winner.vote_pct}%`, background: partyColor(winner.party) }}
                    />
                    <span
                      style={{ width: `${runnerUp.vote_pct}%`, background: partyColor(runnerUp.party) }}
                    />
                    <span
                      style={{ width: `${Math.max(100 - winner.vote_pct - runnerUp.vote_pct, 0)}%` }}
                      className="tug-other"
                    />
                  </div>
                  {constituency.margin != null && (
                    <p className="h2h-margin">
                      Won by <strong>{formatVotes(constituency.margin)}</strong>
                      {constituency.margin_pct != null ? ` (${constituency.margin_pct}%)` : ''}
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <h3 className="sidebar-heading-sm">
            Candidates
            <span className="heading-count">{(constituency.candidates || []).length}</span>
          </h3>
          <CandidateList
            key={acNo}
            candidates={constituency.candidates || []}
            hasWinner={!!winner}
            partyColor={partyColor}
            partyName={partyName}
            allianceOfParty={allianceOfParty}
            nameTip={nameTip}
            allianceTip={allianceTip}
          />
          {nameTip.tipNode}
          {allianceTip.tipNode}
        </>
      )}
    </div>
  );
}

// Below this vote share a candidate folds into the "others" summary row. Every
// candidate under it forfeits their deposit (one-sixth of valid votes), so the
// fold is a real category, not just a "show more" cut-off.
const ALSO_RAN_THRESHOLD = 5;

// The candidate field: the top contenders as ranked-bar rows, with the trailing
// run of sub-threshold also-rans folded behind one expandable summary row so a
// 20-candidate ballot doesn't bury the two names that decided the seat.
function CandidateList({
  candidates,
  hasWinner,
  partyColor,
  partyName,
  allianceOfParty,
  nameTip,
  allianceTip,
}) {
  const [open, setOpen] = useState(false);

  // Candidates arrive sorted by votes (winner first). Always keep the top two —
  // they anchor the head-to-head above — then keep any further candidate still
  // at/above the threshold; fold the rest.
  let split = Math.min(2, candidates.length);
  while (split < candidates.length && (candidates[split].vote_pct ?? 0) >= ALSO_RAN_THRESHOLD) {
    split += 1;
  }
  const contenders = candidates.slice(0, split);
  const folded = candidates.slice(split);
  const foldedPct = folded.reduce((sum, c) => sum + (c.vote_pct ?? 0), 0);

  const rowProps = { partyColor, partyName, allianceOfParty, nameTip, allianceTip };

  return (
    <div className="cand-list">
      {contenders.map((c, i) => (
        <CandRow key={`${c.candidate}-${i}`} c={c} rank={i} r={i} isWinner={i === 0 && hasWinner} {...rowProps} />
      ))}

      {folded.length > 0 && (
        <>
          <button
            type="button"
            className={open ? 'cand-fold open' : 'cand-fold'}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span className="fold-dots" aria-hidden="true">
              {folded.slice(0, 8).map((c, i) => (
                <i key={i} style={{ background: partyColor(c.party) }} />
              ))}
            </span>
            <span className="fold-lbl">
              {open
                ? 'Hide others'
                : `+${folded.length} ${folded.length === 1 ? 'other' : 'others'} · ${foldedPct.toFixed(2)}% combined`}
            </span>
            <span className="fold-chev" aria-hidden="true">
              <Chevron />
            </span>
          </button>
          <div className={open ? 'cand-collapse open' : 'cand-collapse'}>
            <div>
              {folded.map((c, j) => (
                <CandRow
                  key={`${c.candidate}-${split + j}`}
                  c={c}
                  rank={split + j}
                  r={j}
                  member
                  {...rowProps}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CandRow({ c, rank, r, isWinner, member, partyColor, partyName, allianceOfParty, nameTip, allianceTip }) {
  const alliance = allianceOfParty?.get(c.party);
  const cls = ['cand-row', member ? 'is-member' : '', isWinner ? 'is-winner' : '']
    .filter(Boolean)
    .join(' ');
  const pct = Math.min(c.vote_pct ?? 0, 100);
  return (
    <div className={cls} style={{ '--r': r ?? rank }}>
      <span className="cand-rank">
        {isWinner ? <span className="winner-tick">✓</span> : rank + 1}
      </span>
      <span className="candidate-cell">
        <CandidateName name={c.candidate} bold={isWinner} tip={nameTip} />
        <span className="candidate-chips">
          <PartyChip code={c.party} color={partyColor(c.party)} title={partyName(c.party)} />
          {alliance && (
            <span
              className="alliance-dot"
              style={{ backgroundColor: alliance.color }}
              onMouseEnter={(e) => allianceTip.show(alliance.name, e)}
              onMouseMove={allianceTip.move}
              onMouseLeave={allianceTip.hide}
            />
          )}
          <span className="cand-votes">{formatVotes(c.votes)}</span>
        </span>
      </span>
      <span className="cand-pct">{c.vote_pct}%</span>
      {!member && (
        <span
          className="cand-bar"
          style={{ width: `calc((100% - 27px) * ${pct / 100})`, backgroundColor: partyColor(c.party) }}
        />
      )}
    </div>
  );
}

function Chevron() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
