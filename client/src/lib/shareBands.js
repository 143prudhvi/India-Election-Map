// Fixed vote-share slabs for the party/alliance share map mode. Constant
// across parties, states and years so the same shade always means the same
// share (the old scale stretched to each party's max, so shades weren't
// comparable). t is the position on the white -> party-color ramp.
export const SHARE_BANDS = [
  { upTo: 10, t: 0.15, label: '0–10%' },
  { upTo: 20, t: 0.3, label: '10–20%' },
  { upTo: 30, t: 0.45, label: '20–30%' },
  { upTo: 40, t: 0.6, label: '30–40%' },
  { upTo: 50, t: 0.8, label: '40–50%' },
  { upTo: Infinity, t: 1, label: '50%+' },
];

/** Ramp position for a share value, or null when the party got no votes
 *  (rendered white, matching "didn't contest"). */
export function shareBandT(pct) {
  if (!pct || pct <= 0) return null;
  for (const band of SHARE_BANDS) {
    if (pct <= band.upTo) return band.t;
  }
  return 1;
}
