/**
 * seed-data.js — one-time load of the data/ JSON files into Postgres.
 *
 * The database is the source of truth once seeded (admins edit it in-app);
 * this script exists for first boot and for rebuilding a dev database.
 *
 *   node scripts/seed-data.js            # aborts if election data already exists
 *   node scripts/seed-data.js --reset    # wipes and reloads all election data
 *
 * Also exported as seedIfEmpty(pool) — the server calls it at boot so a
 * fresh deployment self-seeds without a manual step. Only touches election
 * data tables; users and sessions are never modified.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeRawResults } from '../shared/electionShape.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA = (...p) => path.join(ROOT, 'data', ...p);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function listYears(slug) {
  const dir = DATA('raw', 'results', slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

async function batchInsert(client, table, columns, rows, chunk = 1000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const params = [];
    const tuples = slice.map((row, r) => {
      const base = r * columns.length;
      params.push(...row);
      return `(${columns.map((_, c) => `$${base + c + 1}`).join(',')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`,
      params
    );
  }
}

export async function seedData(pool, { reset = false, log = console.log } = {}) {
  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM elections');
  if (existing[0].n > 0) {
    if (!reset) {
      throw new Error(
        'Election data already exists in the database. Re-run with --reset to wipe and reload ' +
          '(this discards ALL in-app data edits).'
      );
    }
    log('Resetting election data tables (users/sessions untouched)...');
  }

  const statesMeta = readJson(DATA('raw', 'states-meta.json'));
  const manifest = existsSync(DATA('states.json')) ? readJson(DATA('states.json')) : [];
  const seatsBySlug = new Map(manifest.map((s) => [s.slug, s.total_seats]));
  const partiesFile = readJson(DATA('parties.json'));
  const alliancesFile = existsSync(DATA('raw', 'alliances.json'))
    ? readJson(DATA('raw', 'alliances.json'))
    : {};

  const aliasToCode = new Map();
  for (const p of partiesFile) {
    for (const key of [p.code, p.name, ...(p.aliases ?? [])]) {
      const norm = String(key ?? '').trim().toLowerCase();
      if (norm) aliasToCode.set(norm, p.code);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'TRUNCATE alliance_members, alliances, candidates, constituencies, elections, boundaries, states, parties CASCADE'
    );

    // ---- parties (known registry first; unknowns from results added below)
    const knownParties = partiesFile.map((p) => [
      p.code,
      p.name,
      p.color,
      JSON.stringify(p.aliases ?? []),
    ]);
    await batchInsert(client, 'parties', ['code', 'name', 'color', 'aliases'], knownParties);
    const partyCodes = new Set(partiesFile.map((p) => p.code));

    // ---- states + boundaries
    for (const { slug, name, center, scale } of statesMeta) {
      await client.query(
        'INSERT INTO states (slug, name, total_seats, center, scale) VALUES ($1,$2,$3,$4,$5)',
        [slug, name, seatsBySlug.get(slug) ?? 0, JSON.stringify(center ?? null), scale ?? null]
      );
      const bFile = DATA('boundaries', `${slug}.json`);
      if (existsSync(bFile)) {
        await client.query('INSERT INTO boundaries (slug, topojson) VALUES ($1, $2)', [
          slug,
          readFileSync(bFile, 'utf8'),
        ]);
      }
    }

    // ---- elections, constituencies, candidates
    let electionCount = 0;
    let candidateCount = 0;
    const unknownAll = new Map();
    for (const { slug } of statesMeta) {
      for (const year of listYears(slug)) {
        const rawRows = readJson(DATA('raw', 'results', slug, `${year}.json`));
        const { constituencies, unknown } = normalizeRawResults(rawRows, aliasToCode);
        for (const [name, n] of unknown) unknownAll.set(name, (unknownAll.get(name) ?? 0) + n);

        // Register unknown parties (raw name as code, grey) so the FK holds.
        for (const c of constituencies) {
          for (const cand of c.candidates) {
            if (!partyCodes.has(cand.party)) {
              partyCodes.add(cand.party);
              await client.query(
                `INSERT INTO parties (code, name, color, aliases) VALUES ($1,$1,'#9e9e9e','[]')
                 ON CONFLICT (code) DO NOTHING`,
                [cand.party]
              );
            }
          }
        }

        const { rows: [election] } = await client.query(
          'INSERT INTO elections (state_slug, year) VALUES ($1,$2) RETURNING id',
          [slug, year]
        );

        const acIds = new Map();
        for (const c of constituencies) {
          const { rows: [row] } = await client.query(
            `INSERT INTO constituencies (election_id, ac_no, ac_name, declared)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [election.id, c.ac_no, c.ac_name, c.declared]
          );
          acIds.set(c.ac_no, row.id);
        }

        const candidateRows = [];
        for (const c of constituencies) {
          for (const cand of c.candidates) {
            candidateRows.push([acIds.get(c.ac_no), cand.candidate, cand.party, cand.votes]);
          }
        }
        await batchInsert(
          client,
          'candidates',
          ['constituency_id', 'name', 'party_code', 'votes'],
          candidateRows
        );
        candidateCount += candidateRows.length;

        // ---- alliances for this election
        const defs = alliancesFile[slug]?.[String(year)] ?? [];
        for (let i = 0; i < defs.length; i++) {
          const a = defs[i];
          const { rows: [al] } = await client.query(
            `INSERT INTO alliances (election_id, code, name, color, position)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [election.id, a.code, a.name, a.color, i]
          );
          for (const p of a.parties) {
            if (!partyCodes.has(p)) continue; // alliance listing a party with no candidates anywhere
            await client.query(
              'INSERT INTO alliance_members (alliance_id, party_code) VALUES ($1,$2)',
              [al.id, p]
            );
          }
        }

        electionCount += 1;
      }
    }

    await client.query('COMMIT');
    log(
      `Seeded ${statesMeta.length} states, ${partyCodes.size} parties, ` +
        `${electionCount} elections, ${candidateCount} candidates` +
        (unknownAll.size > 0 ? ` (${unknownAll.size} unknown party names auto-registered)` : '')
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Boot helper: seed only when the election tables are empty. */
export async function seedIfEmpty(pool, log = console.log) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM elections');
  if (rows[0].n > 0) return false;
  if (!existsSync(DATA('raw', 'states-meta.json'))) {
    log('Election tables are empty and no seed files found under data/ — skipping auto-seed.');
    return false;
  }
  log('Election tables are empty — seeding from data/ ...');
  await seedData(pool, { log });
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = await import('../server/db/pool.js');
  seedData(pool, { reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
