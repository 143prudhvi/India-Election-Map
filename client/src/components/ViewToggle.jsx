export default function ViewToggle({ view, onChange }) {
  return (
    <div className="picker-field view-toggle">
      <span className="label">Group by</span>
      <div className="seg-toggle" role="tablist" aria-label="Group results by">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'parties'}
          className={view === 'parties' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => onChange('parties')}
        >
          Parties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'alliances'}
          className={view === 'alliances' ? 'seg-btn active' : 'seg-btn'}
          onClick={() => onChange('alliances')}
        >
          Alliances
        </button>
      </div>
    </div>
  );
}
