import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';

const sql = await readFile(path.join(import.meta.dirname, 'schema.sql'), 'utf8');

try {
  await pool.query(sql);
  console.log('Schema applied.');
} finally {
  await pool.end();
}
