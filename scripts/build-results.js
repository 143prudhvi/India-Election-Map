/**
 * build-results.js
 *
 * Transforms every raw ECI results file data/raw/results/<slug>/<year>.json
 * into the app-facing shape at data/results/<slug>/<year>.json:
 *
 *   - votes parsed robustly (strings with commas -> int, missing/NaN -> 0)
 *   - vote_pct RECOMPUTED from vote totals (raw "Vote %" strings ignored)
 *   - party full names mapped to short codes via data/parties.json aliases
 *     (case-insensitive, trimmed); unknown names keep the raw name as code
 *     and are listed in a report at the end — data is never dropped
 *   - winner / runner_up / margin / summary per the data contract
 *   - ac_no set-compared against data/boundaries/<slug>.json; mismatches
 *     are WARNED loudly but do not fail the build (delimitation changes,
 *     e.g. J&K 2024 vs the old boundary file, are legitimate)
 *
 * Also regenerates the data/states.json manifest (all 31 states, with
 * years / total_seats / center / scale).
 *
 * Exits 1 only if a raw results file is unparseable.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const META_PATH = path.join(ROOT, 'data', 'raw', 'states-meta.json');
const PARTIES_PATH = path.join(ROOT, 'data', 'parties.json');
const RAW_DIR = path.join(ROOT, 'data', 'raw', 'results');
const BOUNDARY_DIR = path.join(ROOT, 'data', 'boundaries');
const OUT_DIR = path.join(ROOT, 'data', 'results');
const MANIFEST_PATH = path.join(ROOT, 'data', 'states.json');

// ---------------------------------------------------------------- helpers

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

/** "1,23,456" | 123456 | "  123 " | null -> integer votes (0 on garbage). */
function parseVotes(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toInt(v) {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function normalizeName(s) {
  return String(s ?? '').trim().toLowerCase();
}

/** parties.json -> Map(normalized alias/name/code -> code). */
function loadPartyMap() {
  if (!existsSync(PARTIES_PATH)) {
    console.warn(`WARNING: ${path.relative(ROOT, PARTIES_PATH)} not found — all parties will keep raw names as codes`);
    return new Map();
  }
  const parties = readJson(PARTIES_PATH);
  const map = new Map();
  for (const p of parties) {
    for (const key of [p.code, p.name, ...(p.aliases ?? [])]) {
      const norm = normalizeName(key);
      if (norm) map.set(norm, p.code);
    }
  }
  return map;
}

/** List year files under data/raw/results/<slug>/, sorted ascending. */
function listYears(slug) {
  const dir = path.join(RAW_DIR, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

/** ac_no set from data/boundaries/<slug>.json, or null if missing. */
function loadBoundaryAcs(slug) {
  const file = path.join(BOUNDARY_DIR, `${slug}.json`);
  if (!existsSync(file)) return null;
  const geoms = readJson(file).objects?.constituencies?.geometries ?? [];
  return new Set(geoms.map((g) => g.properties?.ac_no));
}

function formatAcList(acs) {
  const shown = acs.slice(0, 15).join(', ');
  return acs.length > 15 ? `${shown}, ... +${acs.length - 15} more` : shown;
}

// -------------------------------------------------------- transformation

function buildConstituency(raw, partyMap, unknownParties) {
  const candidatesRaw = Array.isArray(raw.candidates) ? raw.candidates : [];
  const totalVotes = candidatesRaw.reduce((s, c) => s + parseVotes(c['Total Votes']), 0);

  const candidates = candidatesRaw
    .map((c) => {
      const rawParty = String(c.Party ?? '').trim();
      let party = partyMap.get(normalizeName(rawParty));
      if (!party) {
        party = rawParty; // unknown: keep raw full name as the code
        if (rawParty) unknownParties.set(rawParty, (unknownParties.get(rawParty) ?? 0) + 1);
      }
      const votes = parseVotes(c['Total Votes']);
      return {
        candidate: String(c.Candidate ?? '').trim(),
        party,
        votes,
        vote_pct: totalVotes > 0 ? round2((votes / totalVotes) * 100) : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes);

  const winner = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const margin = winner && runnerUp ? winner.votes - runnerUp.votes : null;

  return {
    ac_no: toInt(raw.ac_no),
    ac_name: String(raw.ac_name ?? '').trim(),
    declared: raw.declared ?? true,
    winner,
    runner_up: runnerUp,
    margin,
    margin_pct: margin != null && totalVotes > 0 ? round2((margin / totalVotes) * 100) : null,
    candidates,
  };
}

function buildSummary(constituencies) {
  const stateTotal = constituencies.reduce(
    (s, c) => s + c.candidates.reduce((t, cand) => t + cand.votes, 0),
    0,
  );
  const byParty = new Map(); // code -> { party, seats, votes }
  const entry = (code) => {
    if (!byParty.has(code)) byParty.set(code, { party: code, seats: 0, votes: 0 });
    return byParty.get(code);
  };
  for (const c of constituencies) {
    if (c.winner) entry(c.winner.party).seats += 1;
    for (const cand of c.candidates) entry(cand.party).votes += cand.votes;
  }
  const parties = [...byParty.values()]
    .map((p) => ({ ...p, vote_pct: stateTotal > 0 ? round2((p.votes / stateTotal) * 100) : 0 }))
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes);

  return { total_seats: constituencies.length, parties };
}

function buildStateYear(slug, year, partyMap, unknownParties) {
  const rawFile = path.join(RAW_DIR, slug, `${year}.json`);
  const raw = readJson(rawFile); // parse errors handled by caller
  if (!Array.isArray(raw)) throw new Error(`expected a top-level array in ${rawFile}`);

  const constituencies = raw
    .map((r) => buildConstituency(r, partyMap, unknownParties))
    .sort((a, b) => a.ac_no - b.ac_no);

  return {
    state: slug,
    year,
    summary: buildSummary(constituencies),
    constituencies,
  };
}

// ------------------------------------------------------------------- main

export async function main() {
  const meta = readJson(META_PATH);
  const partyMap = loadPartyMap();
  const unknownParties = new Map(); // raw name -> occurrence count
  const parseFailures = [];
  const joinWarnings = [];

  console.log(`Building results from ${path.relative(ROOT, RAW_DIR)}/ -> ${path.relative(ROOT, OUT_DIR)}/`);
  console.log(`Party alias map: ${partyMap.size} entries`);
  console.log('');

  const maxSeatsBySlug = new Map(); // fallback for manifest total_seats
  let filesWritten = 0;

  for (const { slug } of meta) {
    const years = listYears(slug);
    if (years.length === 0) continue;

    const boundaryAcs = loadBoundaryAcs(slug);
    if (!boundaryAcs) {
      console.warn(`WARNING: no boundary file for ${slug} — skipping join validation`);
    }

    for (const year of years) {
      let out;
      try {
        out = buildStateYear(slug, year, partyMap, unknownParties);
      } catch (err) {
        parseFailures.push({ slug, year, error: err.message });
        console.error(`ERROR: ${slug}/${year}.json unparseable: ${err.message}`);
        continue;
      }

      mkdirSync(path.join(OUT_DIR, slug), { recursive: true });
      writeFileSync(path.join(OUT_DIR, slug, `${year}.json`), JSON.stringify(out));
      filesWritten += 1;

      const seats = out.summary.total_seats;
      maxSeatsBySlug.set(slug, Math.max(maxSeatsBySlug.get(slug) ?? 0, seats));
      const top = out.summary.parties[0];
      console.log(
        `  ${slug}/${year}: ${seats} seats` +
        (top ? `, top: ${top.party} (${top.seats} seats, ${top.vote_pct}%)` : ' (no results)'),
      );

      // ------------------------------------------- join validation
      if (boundaryAcs) {
        const resultAcs = new Set(out.constituencies.map((c) => c.ac_no));
        const resultsOnly = [...resultAcs].filter((n) => !boundaryAcs.has(n)).sort((a, b) => a - b);
        const boundaryOnly = [...boundaryAcs].filter((n) => !resultAcs.has(n)).sort((a, b) => a - b);
        if (resultsOnly.length > 0 || boundaryOnly.length > 0) {
          joinWarnings.push({ slug, year, resultsOnly, boundaryOnly });
        }
      }
    }
  }

  // ------------------------------------------------------------ manifest
  const manifest = meta.map(({ slug, name, center, scale }) => {
    const boundaryAcs = loadBoundaryAcs(slug);
    const total_seats = boundaryAcs?.size ?? maxSeatsBySlug.get(slug) ?? 0;
    return { slug, name, total_seats, years: listYears(slug), center, scale };
  });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('');
  console.log(`Manifest regenerated: ${path.relative(ROOT, MANIFEST_PATH)} (${manifest.length} states)`);

  // ------------------------------------------------------------- reports
  if (joinWarnings.length > 0) {
    console.warn('');
    console.warn('='.repeat(70));
    console.warn(`JOIN MISMATCHES (results ac_no vs boundary ac_no) — ${joinWarnings.length} state-year(s):`);
    console.warn('(not fatal: some are legitimate delimitation changes, e.g. J&K 2024)');
    for (const w of joinWarnings) {
      console.warn(`  ${w.slug}/${w.year}:`);
      if (w.resultsOnly.length > 0) {
        console.warn(`    in results but not boundary (${w.resultsOnly.length}): ${formatAcList(w.resultsOnly)}`);
      }
      if (w.boundaryOnly.length > 0) {
        console.warn(`    in boundary but not results (${w.boundaryOnly.length}): ${formatAcList(w.boundaryOnly)}`);
      }
    }
    console.warn('='.repeat(70));
  }

  if (unknownParties.size > 0) {
    console.warn('');
    console.warn(`UNKNOWN PARTIES (kept raw name as code) — ${unknownParties.size} name(s):`);
    for (const [name, count] of [...unknownParties.entries()].sort((a, b) => b[1] - a[1])) {
      console.warn(`  ${String(count).padStart(5)}x  ${name}`);
    }
  }

  console.log('');
  console.log(`Done. ${filesWritten} results file(s) written.`);

  if (parseFailures.length > 0) {
    console.error('');
    console.error(`FATAL: ${parseFailures.length} unparseable results file(s):`);
    for (const f of parseFailures) console.error(`  ${f.slug}/${f.year}.json — ${f.error}`);
    throw new Error(`${parseFailures.length} results file(s) could not be parsed`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
