import * as d3 from 'd3';

// Fixed magnitude bands (percentage points) for the swing map, so a shade
// means the same swing everywhere. Swing *toward* the party is shown in its
// own color; swing *away* is shown in slate. The ramp position t deepens
// with magnitude.
const BANDS = [
  { upTo: 2, t: 0.2 },
  { upTo: 5, t: 0.45 },
  { upTo: 10, t: 0.7 },
  { upTo: Infinity, t: 1 },
];

const AWAY_COLOR = '#475569'; // slate — swing away from the party
const NEUTRAL = '#f1f5f9'; // ~flat

function bandT(mag) {
  for (const b of BANDS) if (mag < b.upTo) return b.t;
  return 1;
}

/** Color for a signed swing (current − previous share, in points). */
export function swingColor(swing, partyColor) {
  if (swing == null) return '#e0e0e0';
  const mag = Math.abs(swing);
  if (mag < 0.5) return NEUTRAL;
  const t = bandT(mag);
  const ramp = d3.interpolateRgb('#ffffff', swing > 0 ? partyColor : AWAY_COLOR);
  return ramp(t);
}

export const SWING_LEGEND = {
  awayColor: AWAY_COLOR,
  neutral: NEUTRAL,
  // Sample stops for a small legend strip, from strong-away to strong-toward.
  stops: [
    { label: '−10+', mag: -12 },
    { label: '−5', mag: -6 },
    { label: '0', mag: 0 },
    { label: '+5', mag: 6 },
    { label: '+10+', mag: 12 },
  ],
};
