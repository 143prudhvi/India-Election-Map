import * as d3 from 'd3';
import { shareBandT } from './shareBands.js';

// The basic winner/share fill logic shared by the public map and embed
// (a subset of the authed Explorer's modes — no analysis).
const NO_DATA = '#e0e0e0';
const FALLBACK = '#9e9e9e';

export function makeBasicFill({ view, colorMode, resultsByAc, colorFor }) {
  const ramp =
    colorMode === 'winner' ? null : d3.interpolateRgb('#ffffff', colorFor(colorMode));

  const winnerCodeOf = (row) =>
    !row.winner ? null : view === 'alliances' ? row.winner.alliance ?? 'OTH' : row.winner.party;

  const shareOf = (row, code) => {
    if (view === 'alliances') return row.alliance_votes?.[code] ?? 0;
    const cand = (row.candidates || []).find((c) => c.party === code);
    return cand ? cand.vote_pct : 0;
  };

  const fillFor = (acNo) => {
    const row = resultsByAc.get(acNo);
    if (colorMode === 'winner') {
      const code = row ? winnerCodeOf(row) : null;
      return code ? colorFor(code) : NO_DATA;
    }
    const t = shareBandT(row ? shareOf(row, colorMode) : 0);
    return t == null ? '#ffffff' : ramp(t);
  };

  return { fillFor, winnerCodeOf, shareOf };
}

export { NO_DATA, FALLBACK };
