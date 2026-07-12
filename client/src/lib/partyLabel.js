// Registered parties have short codes (BJP, CPI(ML)RS, …) and pass through
// untouched. Parties missing from parties.json keep their full raw name as
// their code — abbreviate those to initials so chips stay chip-sized:
//   "Peoples Party of India (Democratic)" -> "PPI(D)"
//   "Mazdoor Ekta Party"                  -> "MEP"
const STOP_WORDS = new Set(['of', 'the', 'and', 'for']);

export function shortPartyLabel(code) {
  if (!code) return code;
  if (!/\s/.test(code)) {
    // Single token: real codes are short; cap pathological ones.
    return code.length <= 14 ? code : `${code.slice(0, 12)}…`;
  }
  if (code.length <= 10) return code;

  const paren = /\(([^)]+)\)/.exec(code);
  const initialsOf = (text) =>
    text
      .split(/[^A-Za-z]+/)
      .filter((w) => w && !STOP_WORDS.has(w.toLowerCase()))
      .map((w) => w[0].toUpperCase())
      .join('');

  const base = initialsOf(code.replace(/\([^)]*\)/g, ' '));
  const qualifier = paren ? `(${initialsOf(paren[1])})` : '';
  const short = `${base}${qualifier}`;
  return short.length >= 2 ? short : code;
}
