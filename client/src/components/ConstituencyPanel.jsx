import PartyChip from './PartyChip.jsx';

function formatVotes(n) {
  return n == null ? '—' : n.toLocaleString('en-IN');
}

export default function ConstituencyPanel({ acNo, acName, constituency, partyColor, onClose }) {
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

          {constituency.winner && (
            <div className="winner-block">
              <p className="winner-label">Winner</p>
              <p className="winner-name">{constituency.winner.candidate}</p>
              <p className="winner-detail">
                <PartyChip
                  code={constituency.winner.party}
                  color={partyColor(constituency.winner.party)}
                />{' '}
                {formatVotes(constituency.winner.votes)} votes ({constituency.winner.vote_pct}%)
              </p>
            </div>
          )}

          {constituency.runner_up && (
            <p className="runner-up-line">
              Runner-up: {constituency.runner_up.candidate}{' '}
              <PartyChip
                code={constituency.runner_up.party}
                color={partyColor(constituency.runner_up.party)}
              />
              {constituency.margin != null && (
                <>
                  {' '}
                  — margin {formatVotes(constituency.margin)}
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
                  <th>Party</th>
                  <th className="num">Votes</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {(constituency.candidates || []).map((c, i) => (
                  <tr key={`${c.candidate}-${i}`}>
                    <td>{c.candidate}</td>
                    <td>
                      <PartyChip code={c.party} color={partyColor(c.party)} />
                    </td>
                    <td className="num">{formatVotes(c.votes)}</td>
                    <td className="num">{c.vote_pct}%</td>
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
