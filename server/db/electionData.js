import { pool } from './pool.js';
import { computeElection, applyAlliances, normalizeRawResults } from '../../shared/electionShape.js';

// The database is the source of truth; these caches only avoid recomputing
// derived views per request. Every mutation below invalidates precisely.
let manifestCache = null;
let partiesCache = null;
const resultsCache = new Map(); // "slug/year" -> computed election view

export function invalidateManifest() {
  manifestCache = null;
}
export function invalidateParties() {
  partiesCache = null;
}
export function invalidateElection(slug, year) {
  resultsCache.delete(`${slug}/${year}`);
}

// ------------------------------------------------------------------ reads

export async function getManifest() {
  if (!manifestCache) {
    const { rows } = await pool.query(
      `SELECT s.slug, s.name, s.total_seats, s.center, s.scale,
              coalesce(array_agg(e.year ORDER BY e.year) FILTER (WHERE e.year IS NOT NULL), '{}') AS years
       FROM states s LEFT JOIN elections e ON e.state_slug = s.slug
       GROUP BY s.slug ORDER BY s.name`
    );
    manifestCache = rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      total_seats: r.total_seats,
      years: r.years,
      center: r.center,
      scale: r.scale,
    }));
  }
  return manifestCache;
}

export async function getParties() {
  if (!partiesCache) {
    const { rows } = await pool.query(
      'SELECT code, name, color, aliases FROM parties ORDER BY code'
    );
    partiesCache = rows;
  }
  return partiesCache;
}

export async function getBoundary(slug) {
  const { rows } = await pool.query('SELECT topojson FROM boundaries WHERE slug = $1', [slug]);
  return rows[0]?.topojson ?? null;
}

async function getElectionId(slug, year, client = pool) {
  const { rows } = await client.query(
    'SELECT id FROM elections WHERE state_slug = $1 AND year = $2',
    [slug, year]
  );
  return rows[0]?.id ?? null;
}

async function loadAllianceDefs(electionId, client = pool) {
  const { rows } = await client.query(
    `SELECT a.code, a.name, a.color,
            coalesce(array_agg(m.party_code) FILTER (WHERE m.party_code IS NOT NULL), '{}') AS parties
     FROM alliances a LEFT JOIN alliance_members m ON m.alliance_id = a.id
     WHERE a.election_id = $1
     GROUP BY a.id ORDER BY a.position, a.id`,
    [electionId]
  );
  return rows;
}

export async function getResults(slug, year) {
  const key = `${slug}/${year}`;
  if (resultsCache.has(key)) return resultsCache.get(key);

  const electionId = await getElectionId(slug, year);
  if (!electionId) return null;

  const { rows: acRows } = await pool.query(
    `SELECT id, ac_no, ac_name, declared FROM constituencies
     WHERE election_id = $1 ORDER BY ac_no`,
    [electionId]
  );
  const { rows: candRows } = await pool.query(
    `SELECT c.ac_no, cd.name, cd.party_code, cd.votes
     FROM candidates cd JOIN constituencies c ON c.id = cd.constituency_id
     WHERE c.election_id = $1 ORDER BY cd.id`,
    [electionId]
  );
  const byAc = new Map(acRows.map((r) => [r.ac_no, { ...r, candidates: [] }]));
  for (const cd of candRows) {
    byAc.get(cd.ac_no)?.candidates.push({ candidate: cd.name, party: cd.party_code, votes: cd.votes });
  }
  const defs = await loadAllianceDefs(electionId);

  const view = computeElection({
    state: slug,
    year,
    constituencies: [...byAc.values()],
    alliances: defs.length > 0 ? defs : null,
  });
  resultsCache.set(key, view);
  return view;
}

// -------------------------------------------------------------- mutations

export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function updateState(slug, { name }) {
  const { rows } = await pool.query(
    `UPDATE states SET name = coalesce($2, name), updated_at = now()
     WHERE slug = $1 RETURNING slug, name, total_seats`,
    [slug, name ?? null]
  );
  if (!rows[0]) throw new DataError(404, 'Unknown state');
  invalidateManifest();
  return rows[0];
}

export async function createParty({ code, name, color, aliases = [] }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO parties (code, name, color, aliases) VALUES ($1,$2,$3,$4)
       RETURNING code, name, color, aliases`,
      [code, name, color, JSON.stringify(aliases)]
    );
    invalidateParties();
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new DataError(409, `Party code ${code} already exists`);
    throw err;
  }
}

export async function updateParty(code, { name, color, aliases }) {
  const { rows } = await pool.query(
    `UPDATE parties SET
       name = coalesce($2, name),
       color = coalesce($3, color),
       aliases = coalesce($4, aliases),
       updated_at = now()
     WHERE code = $1
     RETURNING code, name, color, aliases`,
    [code, name ?? null, color ?? null, aliases ? JSON.stringify(aliases) : null]
  );
  if (!rows[0]) throw new DataError(404, 'Unknown party');
  invalidateParties();
  return rows[0];
}

export async function deleteParty(code) {
  try {
    const { rowCount } = await pool.query('DELETE FROM parties WHERE code = $1', [code]);
    if (rowCount === 0) throw new DataError(404, 'Unknown party');
    invalidateParties();
  } catch (err) {
    if (err.code === '23503') {
      throw new DataError(
        409,
        `${code} is referenced by candidates or alliances and cannot be deleted`
      );
    }
    throw err;
  }
}

/** Replace the full alliance set for one election. Empty array clears it. */
export async function replaceAlliances(slug, year, defs) {
  const electionId = await getElectionId(slug, year);
  if (!electionId) throw new DataError(404, 'Unknown state or year');

  // A party may belong to at most one bloc.
  const seen = new Map();
  for (const a of defs) {
    for (const p of a.parties) {
      if (seen.has(p)) {
        throw new DataError(400, `Party ${p} is in both ${seen.get(p)} and ${a.code}`);
      }
      seen.set(p, a.code);
    }
  }
  const codes = [...seen.keys()];
  if (codes.length > 0) {
    const { rows } = await pool.query('SELECT code FROM parties WHERE code = ANY($1)', [codes]);
    const known = new Set(rows.map((r) => r.code));
    const missing = codes.filter((c) => !known.has(c));
    if (missing.length > 0) {
      throw new DataError(400, `Unknown party code(s): ${missing.join(', ')}`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM alliances WHERE election_id = $1', [electionId]);
    for (let i = 0; i < defs.length; i++) {
      const a = defs[i];
      const { rows: [al] } = await client.query(
        `INSERT INTO alliances (election_id, code, name, color, position)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [electionId, a.code, a.name, a.color, i]
      );
      for (const p of a.parties) {
        await client.query(
          'INSERT INTO alliance_members (alliance_id, party_code) VALUES ($1,$2)',
          [al.id, p]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new DataError(400, 'Duplicate alliance code');
    throw err;
  } finally {
    client.release();
  }
  invalidateElection(slug, year);
  return getResults(slug, year);
}

/** Replace one constituency's fields and (optionally) its full candidate list. */
export async function updateConstituency(slug, year, acNo, { ac_name, declared, candidates }) {
  const electionId = await getElectionId(slug, year);
  if (!electionId) throw new DataError(404, 'Unknown state or year');

  if (candidates) {
    const codes = [...new Set(candidates.map((c) => c.party))];
    const { rows } = await pool.query('SELECT code FROM parties WHERE code = ANY($1)', [codes]);
    const known = new Set(rows.map((r) => r.code));
    const missing = codes.filter((c) => !known.has(c));
    if (missing.length > 0) {
      throw new DataError(400, `Unknown party code(s): ${missing.join(', ')} — add them in Parties first`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [ac] } = await client.query(
      `UPDATE constituencies SET
         ac_name = coalesce($3, ac_name),
         declared = coalesce($4, declared)
       WHERE election_id = $1 AND ac_no = $2
       RETURNING id`,
      [electionId, acNo, ac_name ?? null, declared ?? null]
    );
    if (!ac) {
      await client.query('ROLLBACK');
      throw new DataError(404, 'Unknown constituency');
    }
    if (candidates) {
      await client.query('DELETE FROM candidates WHERE constituency_id = $1', [ac.id]);
      for (const c of candidates) {
        await client.query(
          'INSERT INTO candidates (constituency_id, name, party_code, votes) VALUES ($1,$2,$3,$4)',
          [ac.id, c.candidate, c.party, c.votes]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  invalidateElection(slug, year);
  const view = await getResults(slug, year);
  return view.constituencies.find((c) => c.ac_no === acNo);
}

/** Create an election from raw ECI-shaped rows. Unknown party names are
 *  auto-registered (raw name as code, grey) exactly like the seed does. */
export async function createElection(slug, year, rawRows) {
  const { rows: stateRows } = await pool.query('SELECT slug FROM states WHERE slug = $1', [slug]);
  if (!stateRows[0]) throw new DataError(404, 'Unknown state');
  if (await getElectionId(slug, year)) {
    throw new DataError(409, `${slug} ${year} already exists — delete it first to re-import`);
  }

  const parties = await getParties();
  const aliasToCode = new Map();
  for (const p of parties) {
    for (const key of [p.code, p.name, ...(p.aliases ?? [])]) {
      const norm = String(key ?? '').trim().toLowerCase();
      if (norm) aliasToCode.set(norm, p.code);
    }
  }
  const { constituencies, unknown } = normalizeRawResults(rawRows, aliasToCode);

  const seenAc = new Set();
  for (const c of constituencies) {
    if (!Number.isInteger(c.ac_no) || c.ac_no < 1) {
      throw new DataError(400, `Invalid ac_no: ${JSON.stringify(c.ac_no)}`);
    }
    if (seenAc.has(c.ac_no)) throw new DataError(400, `Duplicate ac_no ${c.ac_no}`);
    seenAc.add(c.ac_no);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const name of unknown.keys()) {
      await client.query(
        `INSERT INTO parties (code, name, color, aliases) VALUES ($1,$1,'#9e9e9e','[]')
         ON CONFLICT (code) DO NOTHING`,
        [name]
      );
    }
    const { rows: [election] } = await client.query(
      'INSERT INTO elections (state_slug, year) VALUES ($1,$2) RETURNING id',
      [slug, year]
    );
    for (const c of constituencies) {
      const { rows: [ac] } = await client.query(
        `INSERT INTO constituencies (election_id, ac_no, ac_name, declared)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [election.id, c.ac_no, c.ac_name, c.declared]
      );
      for (const cand of c.candidates) {
        await client.query(
          'INSERT INTO candidates (constituency_id, name, party_code, votes) VALUES ($1,$2,$3,$4)',
          [ac.id, cand.candidate, cand.party, cand.votes]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  invalidateManifest();
  invalidateParties(); // may have auto-registered unknowns
  invalidateElection(slug, year);
  return {
    constituencies: constituencies.length,
    unknown_parties: [...unknown.keys()],
  };
}

export async function deleteElection(slug, year) {
  const electionId = await getElectionId(slug, year);
  if (!electionId) throw new DataError(404, 'Unknown state or year');
  await pool.query('DELETE FROM elections WHERE id = $1', [electionId]);
  invalidateManifest();
  invalidateElection(slug, year);
}

/** Rebuild data/raw/alliances.json shape from the database (for export). */
export async function exportAlliances() {
  const { rows } = await pool.query(
    `SELECT e.state_slug, e.year, a.code, a.name, a.color, a.position,
            coalesce(array_agg(m.party_code) FILTER (WHERE m.party_code IS NOT NULL), '{}') AS parties
     FROM alliances a
     JOIN elections e ON e.id = a.election_id
     LEFT JOIN alliance_members m ON m.alliance_id = a.id
     GROUP BY e.state_slug, e.year, a.id
     ORDER BY e.state_slug, e.year, a.position, a.id`
  );
  const out = {};
  for (const r of rows) {
    out[r.state_slug] ??= {};
    out[r.state_slug][r.year] ??= [];
    out[r.state_slug][r.year].push({ code: r.code, name: r.name, color: r.color, parties: r.parties });
  }
  return out;
}

export { applyAlliances };
