/**
 * build-data.js — pipeline orchestrator.
 *
 * Usage:
 *   node scripts/build-data.js               # results only (boundaries reused)
 *   node scripts/build-data.js --boundaries  # force boundary rebuild first
 *
 * Boundary simplification runs when --boundaries is passed OR when
 * data/boundaries/ is missing/empty (first run). Results are always rebuilt.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main as simplifyBoundaries } from './simplify-boundaries.js';
import { main as buildResults } from './build-results.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BOUNDARY_DIR = path.join(ROOT, 'data', 'boundaries');

function boundariesMissing() {
  if (!existsSync(BOUNDARY_DIR)) return true;
  return !readdirSync(BOUNDARY_DIR).some((f) => f.endsWith('.json'));
}

export async function main(argv = process.argv.slice(2)) {
  const force = argv.includes('--boundaries');

  if (force || boundariesMissing()) {
    console.log(force
      ? '--boundaries passed: rebuilding boundaries'
      : 'data/boundaries missing or empty: building boundaries');
    console.log('');
    await simplifyBoundaries();
  } else {
    console.log('Boundaries up to date (pass --boundaries to force a rebuild).');
  }

  console.log('');
  await buildResults();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
