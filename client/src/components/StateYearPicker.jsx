export default function StateYearPicker({
  states,
  selectedState,
  selectedYear,
  onStateChange,
  onYearChange,
}) {
  const current = (states || []).find((s) => s.slug === selectedState);
  const years = current ? [...current.years].sort((a, b) => b - a) : [];

  return (
    <div className="state-year-picker">
      <label className="picker-field">
        <span className="label">State</span>
        <select
          className="select"
          value={selectedState}
          onChange={(e) => onStateChange(e.target.value)}
        >
          {(states || []).map((s) => (
            <option key={s.slug} value={s.slug} disabled={s.years.length === 0}>
              {s.name}
              {s.years.length === 0 ? ' (no data)' : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="picker-field">
        <span className="label">Year</span>
        <select
          className="select"
          value={selectedYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
