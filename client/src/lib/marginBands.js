// Fixed victory-margin bands for the "marginal / safe seats" map mode.
// Constant across states and years so a shade always means the same
// contestability. Marginal seats pop (warm), safe seats recede (cool green).
export const MARGIN_BANDS = [
  { upTo: 5, color: '#b91c1c', label: 'Ultra-marginal (<5%)' },
  { upTo: 10, color: '#f97316', label: 'Marginal (5–10%)' },
  { upTo: 20, color: '#eab308', label: 'Leaning (10–20%)' },
  { upTo: Infinity, color: '#16a34a', label: 'Safe (20%+)' },
];

export const NO_MARGIN_FILL = '#e0e0e0';

/** Band color for a winner's margin_pct, or null when there's no margin. */
export function marginColor(marginPct) {
  if (marginPct == null) return null;
  for (const band of MARGIN_BANDS) {
    if (marginPct < band.upTo) return band.color;
  }
  return MARGIN_BANDS[MARGIN_BANDS.length - 1].color;
}
