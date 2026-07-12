import PartyChip from './PartyChip.jsx';

function formatVotes(n) {
  return n == null ? '—' : n.toLocaleString('en-IN');
}

export default function ConstituencyPanel({
  acNo,
  acName,
  constituency,
  partyColor,
  partyName,
  onClose,
}) {
  const winner = constituency?.winner;
  const runnerUp = constituency?.runner_up;

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
            <div
              className="winner-block"
              style={{ borderLeftColor: partyColor(winner.party) }}
            >
              <p className="winner-label">Winner</p>
              <p className="winner-name">{winner.candidate}</p>
              <p className="winner-detail">
                <PartyChip
                  code={winner.party}
                  color={partyColor(winner.party)}
                  title={partyName(winner.party)}
                />{' '}
                {formatVotes(winner.votes)} votes ({winner.vote_pct}%)
              </p>

              {runnerUp && (
                <div className="margin-viz" aria-hidden="true">
                  <div className="margin-bar-row">
                    <span
                      className="margin-bar"
                      style={{
                        width: '100%',
                        backgroundColor: partyColor(winner.party),
                      }}
                    />
                  </div>
                  <div className="margin-bar-row">
                    <span
                      className="margin-bar"
                      style={{
                        width: `${Math.max((runnerUp.votes / (winner.votes || 1)) * 100, 2)}%`,
                        backgroundColor: partyColor(runnerUp.party),
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {runnerUp && (
            <p className="runner-up-line">
              Runner-up: {runnerUp.candidate}{' '}
              <PartyChip
                code={runnerUp.party}
                color={partyColor(runnerUp.party)}
                title={partyName(runnerUp.party)}
              />
              {constituency.margin != null && (
                <>
                  {' '}
                  — margin <strong>{formatVotes(constituency.margin)}</strong>
                  {constituency.margin_pct != null ? ` (${constituency.margin_pct}%)` : ''}
                </>
              )}
            </p>
          )}

          <h3 className="sidebar-heading-sm">Candidates</h3>
          <div className="table-scroll">
            <table className="candidates-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th className="num">Votes</th>
                  <th className="num pct-col">%</th>
                </tr>
              </thead>
              <tbody>
                {(constituency.candidates || []).map((c, i) => (
                  <tr key={`${c.candidate}-${i}`}>
                    <td>
                      <span className="candidate-cell">
                        <span className="candidate-name" title={c.candidate}>
                          {c.candidate}
                        </span>
                        <PartyChip
                          code={c.party}
                          color={partyColor(c.party)}
                          title={partyName(c.party)}
                        />
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
        </>
      )}
    </div>
  );
}
