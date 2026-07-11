/**
 * simplify-boundaries.js
 *
 * One-time (re-runnable) boundary build. For every state listed in
 * data/raw/states-meta.json it reads the legacy TopoJSON at
 * public/json/<State>/<State>.json and writes data/boundaries/<slug>.json:
 *
 *   - single object key "constituencies"
 *   - feature properties normalized to exactly { ac_no: int, ac_name: string }
 *     (drops stale junk like "Winner Party", wrong st_name, shape_leng, ...)
 *   - topojson output with precision quantization (precision=0.0001)
 *   - geometry simplified ONLY when the source file is oversized (> 1 MB,
 *     in practice only Jammu and Kashmir); small sources keep their
 *     current visual quality untouched.
 *
 * Also builds data/boundaries/_india.json from public/json/states.json
 * (states layer only, properties normalized to { name }, simplified 10%).
 *
 * NOTE: the legacy sources under public/json/ are deleted after the one-time
 * run of this script. If you ever need to rebuild from scratch, the sources
 * are recoverable from git history on the master branch.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAPSHAPER = path.join(ROOT, 'node_modules', '.bin', 'mapshaper');
const META_PATH = path.join(ROOT, 'data', 'raw', 'states-meta.json');
const SRC_DIR = path.join(ROOT, 'public', 'json');
const OUT_DIR = path.join(ROOT, 'data', 'boundaries');

const SIMPLIFY_THRESHOLD = 1024 * 1024; // 1 MB
const STATE_SIMPLIFY = ['-simplify', 'visvalingam', '3%', 'keep-shapes'];
const INDIA_SIMPLIFY = ['-simplify', 'visvalingam', '10%', 'keep-shapes'];

// ---------------------------------------------------------------- helpers

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function runMapshaper(args) {
  execFileSync(MAPSHAPER, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Normalization applied to every constituency feature (drops all junk). */
const CONSTITUENCY_EACH =
  "this.properties = { ac_no: Math.round(Number(this.properties.ac_no)), " +
  "ac_name: String(this.properties.ac_name ?? '').trim() }";

/**
 * Some boundary sources (Gujarat, Madhya Pradesh) carry only ac_no with no
 * ac_name. Backfill names from the newest raw results file for the state.
 */
function backfillNames(outFile, slug) {
  const resultsDir = path.join(ROOT, 'data', 'raw', 'results', slug);
  if (!existsSync(resultsDir)) return;
  const years = readdirSync(resultsDir).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  if (years.length === 0) return;
  const results = readJson(path.join(resultsDir, years[years.length - 1]));
  const names = new Map(results.map((r) => [Math.round(Number(r.ac_no)), String(r.ac_name ?? '').trim()]));

  const topo = readJson(outFile);
  let filled = 0;
  for (const g of topo.objects?.constituencies?.geometries ?? []) {
    const p = g.properties ?? {};
    if (p.ac_name === '' && names.get(p.ac_no)) {
      p.ac_name = names.get(p.ac_no);
      filled += 1;
    }
  }
  if (filled > 0) {
    writeFileSync(outFile, JSON.stringify(topo));
    console.log(`  (backfilled ${filled} ac_name(s) for ${slug} from raw results ${years[years.length - 1]})`);
  }
}

/** Validate one built state file; returns a list of problem strings. */
function validateStateOutput(outFile, expectedCount) {
  const problems = [];
  const topo = readJson(outFile);
  const layer = topo.objects?.constituencies;
  if (!layer) {
    return [`missing objects.constituencies (keys: ${Object.keys(topo.objects ?? {}).join(', ')})`];
  }
  const geoms = layer.geometries ?? [];
  if (geoms.length !== expectedCount) {
    problems.push(`feature count ${geoms.length} != source count ${expectedCount}`);
  }
  const bad = [];
  for (const g of geoms) {
    const p = g.properties ?? {};
    // ac_no 0 with an empty name is a legitimate "unassigned area" placeholder
    // polygon present in some sources (e.g. Sikkim); it renders unfilled.
    const placeholder = p.ac_no === 0;
    if (!Number.isInteger(p.ac_no) || p.ac_no < 0 || typeof p.ac_name !== 'string'
        || (p.ac_name.length === 0 && !placeholder)) {
      bad.push(`ac_no=${JSON.stringify(p.ac_no)} ac_name=${JSON.stringify(p.ac_name)}`);
    }
  }
  if (bad.length > 0) {
    const sample = bad.slice(0, 5).join('; ');
    problems.push(`${bad.length} feature(s) with bad properties: ${sample}${bad.length > 5 ? '; ...' : ''}`);
  }
  return problems;
}

// ---------------------------------------------------------- state builder

function buildState({ slug, name }, rows, violations) {
  const srcFile = path.join(SRC_DIR, name, `${name}.json`);
  const outFile = path.join(OUT_DIR, `${slug}.json`);

  if (!existsSync(srcFile)) {
    console.warn(`WARNING: source boundary missing, skipping ${name} (${srcFile})`);
    console.warn('         (sources are recoverable via git history on master)');
    return;
  }

  const srcSize = statSync(srcFile).size;
  const src = readJson(srcFile);
  const objKey = Object.hasOwn(src.objects ?? {}, name) ? name : Object.keys(src.objects ?? {})[0];
  const srcCount = src.objects?.[objKey]?.geometries?.length ?? 0;

  const oversized = srcSize > SIMPLIFY_THRESHOLD;
  const args = [
    '-i', srcFile,
    '-clean', 'allow-empty',
    ...(oversized ? STATE_SIMPLIFY : []),
    '-each', CONSTITUENCY_EACH,
    '-rename-layers', 'constituencies',
    '-o', outFile, 'format=topojson', 'precision=0.0001', 'force',
  ];

  try {
    runMapshaper(args);
  } catch (err) {
    violations.push({ state: name, problem: `mapshaper failed: ${firstErrorLine(err)}` });
    return;
  }

  backfillNames(outFile, slug);

  for (const problem of validateStateOutput(outFile, srcCount)) {
    violations.push({ state: name, problem });
  }

  rows.push({
    name,
    features: srcCount,
    before: srcSize,
    after: statSync(outFile).size,
    simplified: oversized ? '3%' : '-',
  });
}

// ----------------------------------------------------------- india builder

function buildIndia(rows, violations) {
  const srcFile = path.join(SRC_DIR, 'states.json');
  const outFile = path.join(OUT_DIR, '_india.json');

  if (!existsSync(srcFile)) {
    console.warn(`WARNING: national source missing, skipping _india.json (${srcFile})`);
    return;
  }

  const src = readJson(srcFile);
  const statesLayer = src.objects?.states;
  if (!statesLayer) {
    violations.push({ state: '_india', problem: 'public/json/states.json has no objects.states layer' });
    return;
  }

  // Find a sensible name property on the states layer.
  const sampleProps = statesLayer.geometries?.[0]?.properties ?? {};
  const nameKey = ['st_nm', 'ST_NM', 'st_name', 'ST_NAME', 'name', 'NAME']
    .find((k) => Object.hasOwn(sampleProps, k));
  if (!nameKey) {
    violations.push({
      state: '_india',
      problem: `no recognizable name property on states layer (found: ${Object.keys(sampleProps).join(', ')})`,
    });
    return;
  }

  const eachExpr =
    `this.properties = { name: String(this.properties[${JSON.stringify(nameKey)}] ?? '').trim() }`;

  const args = [
    '-i', srcFile,
    '-target', 'states',       // keep ONLY the states layer (drops districts)
    ...INDIA_SIMPLIFY,
    '-each', eachExpr,
    '-o', outFile, 'format=topojson', 'precision=0.001', 'target=states', 'force',
  ];

  try {
    runMapshaper(args);
  } catch (err) {
    violations.push({ state: '_india', problem: `mapshaper failed: ${firstErrorLine(err)}` });
    return;
  }

  const topo = readJson(outFile);
  const geoms = topo.objects?.states?.geometries;
  if (!geoms) {
    violations.push({ state: '_india', problem: 'output missing objects.states' });
  } else {
    const unnamed = geoms.filter((g) => !g.properties?.name).length;
    if (unnamed > 0) {
      violations.push({ state: '_india', problem: `${unnamed} state feature(s) with empty name` });
    }
    rows.push({
      name: '_india (states layer)',
      features: geoms.length,
      before: statSync(srcFile).size,
      after: statSync(outFile).size,
      simplified: '10%',
    });
  }
}

function firstErrorLine(err) {
  const text = `${err.stderr || err.message || err}`;
  return text.split('\n').find((l) => l.trim()) ?? 'unknown error';
}

// ------------------------------------------------------------------- main

export async function main() {
  if (!existsSync(MAPSHAPER)) {
    throw new Error(`mapshaper binary not found at ${MAPSHAPER} — run npm install first`);
  }

  const meta = readJson(META_PATH);
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Simplifying boundaries for ${meta.length} states -> ${path.relative(ROOT, OUT_DIR)}/`);
  console.log('');

  const rows = [];
  const violations = [];

  for (const state of meta) {
    buildState(state, rows, violations);
  }
  buildIndia(rows, violations);

  // ------------------------------------------------------- size report
  const nameW = Math.max(...rows.map((r) => r.name.length), 5);
  console.log(
    `${'State'.padEnd(nameW)}  ${'Feats'.padStart(5)}  ${'Before'.padStart(10)}  ${'After'.padStart(10)}  Simplify`,
  );
  console.log('-'.repeat(nameW + 42));
  for (const r of rows) {
    console.log(
      `${r.name.padEnd(nameW)}  ${String(r.features).padStart(5)}  ` +
      `${kb(r.before).padStart(10)}  ${kb(r.after).padStart(10)}  ${r.simplified}`,
    );
  }
  const totalBefore = rows.reduce((s, r) => s + r.before, 0);
  const totalAfter = rows.reduce((s, r) => s + r.after, 0);
  console.log('-'.repeat(nameW + 42));
  console.log(`${'TOTAL'.padEnd(nameW)}  ${''.padStart(5)}  ${kb(totalBefore).padStart(10)}  ${kb(totalAfter).padStart(10)}`);
  console.log('');

  // -------------------------------------------------- violation report
  if (violations.length > 0) {
    console.error(`BOUNDARY VALIDATION FAILED — ${violations.length} problem(s):`);
    for (const v of violations) {
      console.error(`  [${v.state}] ${v.problem}`);
    }
    throw new Error(`boundary validation failed for ${new Set(violations.map((v) => v.state)).size} state(s)`);
  }

  console.log(`Done. ${rows.length} boundary files written, all validations passed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
