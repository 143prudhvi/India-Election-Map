// Candidate names arrive ALL-CAPS from the ECI data ("SADEQUE MUNIRODDIN
// SHAIKH"). Title-case them for display, capitalizing after spaces, dots,
// hyphens, apostrophes and brackets so initials ("S. K.") and compound
// names survive. Mixed-case input is trusted and passed through.
export function displayName(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  if (s === 'NOTA') return s;
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s.\-'("])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
}
