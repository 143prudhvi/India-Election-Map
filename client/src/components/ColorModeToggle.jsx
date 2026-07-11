export default function ColorModeToggle({ mode, parties, onChange }) {
  return (
    <label className="picker-field color-mode-toggle">
      <span className="label">Color</span>
      <select className="select" value={mode} onChange={(e) => onChange(e.target.value)}>
        <option value="winner">Winner</option>
        {(parties || []).map((p) => (
          <option key={p.party} value={p.party}>
            {p.party} vote share
          </option>
        ))}
      </select>
    </label>
  );
}
