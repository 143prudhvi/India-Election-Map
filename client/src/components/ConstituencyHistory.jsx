import { useApi } from '../hooks/useApi.js';
import PartyChip from './PartyChip.jsx';
import { displayName } from '../lib/formatName.js';
import { shortPartyLabel } from '../lib/partyLabel.js';

// Pro: a constituency's winners across every election of the state, shown
// when a seat is selected. Free users see an upgrade nudge instead.
export default function ConstituencyHistory({ slug, acNo, isPro, partyColor, partyName, onUpgrade }) {
  if (!isPro) {
    return (
      <div className="history-locked">
        <h3 className="sidebar-heading-sm">
          Seat history <span className="pro-tag">PRO</span>
        </h3>
        <p className="card-hint">See how this constituency voted in every past election.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onUpgrade}>
          Upgrade to Pro
        </button>
      </div>
    );
  }
  return <HistoryBody slug={slug} acNo={acNo} partyColor={partyColor} partyName={partyName} />;
}

function HistoryBody({ slug, acNo, partyColor, partyName }) {
  const { data, loading, error } = useApi(`/api/data/${slug}/${acNo}/history`);

  if (loading) {
    return (
      <div className="spinner-wrap">
        <div className="spinner" aria-label="Loading history" />
      </div>
    );
  }
  if (error) return <p className="form-error">Could not load history: {error.message}</p>;
  const rows = (data?.history || []).slice().sort((a, b) => b.year - a.year);
  if (rows.length === 0) return <p className="card-hint">No prior results for this seat.</p>;

  return (
    <div>
      <h3 className="sidebar-heading-sm">Seat history</h3>
      <table className="history-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Winner</th>
            <th className="num">Vote %</th>
            <th className="num">Margin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="mono">{r.year}</td>
              <td>
                <span className="history-winner">
                  {r.winner ? (
                    <>
                      <PartyChip
                        code={r.winner.party}
                        color={partyColor(r.winner.party)}
                        title={partyName(r.winner.party)}
                      />
                      <span className="history-cand" title={displayName(r.winner.candidate)}>
                        {displayName(r.winner.candidate)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </td>
              <td className="num">{r.winner ? `${r.winner.vote_pct}%` : '—'}</td>
              <td className="num">{r.margin_pct != null ? `${r.margin_pct}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="legend-note">
        Matched by constituency number; may differ where boundaries were redrawn.
      </p>
    </div>
  );
}
