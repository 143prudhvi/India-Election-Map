function readableTextColor(bg) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg || '');
  if (!match) return '#ffffff';
  let hex = match[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

export default function PartyChip({ code, color, title }) {
  const bg = color || '#9e9e9e';
  return (
    <span
      className="party-chip"
      style={{ backgroundColor: bg, color: readableTextColor(bg) }}
      title={title || code}
    >
      {code}
    </span>
  );
}
