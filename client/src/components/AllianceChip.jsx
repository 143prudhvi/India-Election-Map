import { useTip } from '../hooks/useTip.jsx';

// Outlined chip so the alliance vocabulary stays visually distinct from the
// solid party chips.
export default function AllianceChip({ code, color, name }) {
  const c = color || '#9e9e9e';
  const tip = useTip();
  const full = name && name !== code ? name : null;

  return (
    <>
      <span
        className="alliance-chip"
        style={{ borderColor: c, color: c }}
        onMouseEnter={full ? (e) => tip.show(full, e) : undefined}
        onMouseMove={full ? tip.move : undefined}
        onMouseLeave={full ? tip.hide : undefined}
      >
        {code}
      </span>
      {tip.tipNode}
    </>
  );
}
