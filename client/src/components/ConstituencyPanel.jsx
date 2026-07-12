import { useRef } from 'react';
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
          <div className="table-scroll">
            <table className="candidates-table">
              <thead>
                <tr>
                  <th className="rank-col" aria-label="Position" />
                  <th>Candidate</th>
                  <th className="num">Votes</th>
                  <th className="num pct-col">%</th>
                </tr>
              </thead>
              <tbody>
                {(constituency.candidates || []).map((c, i) => (
                  <tr
                    key={`${c.candidate}-${i}`}
                    className={i === 0 && winner ? 'winner-row' : undefined}
                    style={{ '--r': i }}
                  >
                    <td className="rank">
                      {i === 0 && winner ? <span className="winner-tick">✓</span> : i + 1}
                    </td>
                    <td>
                      <span className="candidate-cell">
                        <CandidateName name={c.candidate} bold={i === 0 && !!winner} tip={nameTip} />
                        <span className="candidate-chips">
                          <PartyChip
                            code={c.party}
                            color={partyColor(c.party)}
                            title={partyName(c.party)}
                          />
                          {allianceOfParty?.get(c.party) && (
                            <span
                              className="alliance-dot"
                              style={{ backgroundColor: allianceOfParty.get(c.party).color }}
                              onMouseEnter={(e) =>
                                allianceTip.show(allianceOfParty.get(c.party).name, e)
                              }
                              onMouseMove={allianceTip.move}
                              onMouseLeave={allianceTip.hide}
                            />
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="num">{formatVotes(c.votes)}</td>
                    <td className="num pct-col">
                      <span className="pct-cell">
                        <span
                          className="pct-bar"
                          style={{
                            width: `${Math.min(c.vote_pct ?? 0, 100)}%`,
                            backgroundColor: partyColor(c.party),
                          }}
                        />
                        <span className="pct-num">{c.vote_pct}%</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nameTip.tipNode}
          {allianceTip.tipNode}
        </>
      )}
    </div>
  );
}
