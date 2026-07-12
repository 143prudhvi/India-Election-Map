import crypto from 'node:crypto';
import { pool } from './pool.js';

// API keys are shown to the user exactly once, at creation. We only ever
// store a sha256 hash of the full plaintext plus a short display prefix, so a
// database leak never exposes a usable key.

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/** Mint a fresh key. plaintext is returned once and never persisted. */
export function generateKey() {
  const plaintext = 'iem_' + crypto.randomBytes(32).toString('base64url');
  return {
    plaintext,
    key_prefix: plaintext.slice(0, 12), // e.g. "iem_a1b2c3d"
    key_hash: hashKey(plaintext),
  };
}

export async function createKey(userId, name) {
  const { plaintext, key_prefix, key_hash } = generateKey();
  const { rows } = await pool.query(
    `INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, key_prefix, created_at`,
    [userId, name, key_prefix, key_hash]
  );
  return { row: rows[0], plaintext };
}

export async function listKeys(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, last_used_at, revoked, created_at
     FROM api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function revokeKey(id, userId) {
  const { rowCount } = await pool.query(
    'UPDATE api_keys SET revoked = true WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rowCount > 0;
}

/** Resolve a plaintext key to its active row + owner role/tier, or null. */
export async function findActiveByPlaintext(plaintext) {
  const { rows } = await pool.query(
    `SELECT k.id, k.user_id, u.role, u.tier
     FROM api_keys k JOIN users u ON u.id = k.user_id
     WHERE k.key_hash = $1 AND k.revoked = false`,
    [hashKey(plaintext)]
  );
  return rows[0] ?? null;
}

/** Fire-and-forget usage stamp; callers need not await. */
export function touchLastUsed(id) {
  return pool
    .query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [id])
    .catch((err) => console.error('touchLastUsed failed:', err.message));
}
