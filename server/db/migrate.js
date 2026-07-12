import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from './pool.js';

/** Idempotent (CREATE ... IF NOT EXISTS throughout) — safe to run at boot. */
export async function runMigrations() {
  const sql = await readFile(path.join(import.meta.dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await runMigrations();
    console.log('Schema applied.');
  } finally {
    await pool.end();
  }
}
