import { pool } from './pool.js';

// The public shape returned to clients; password_hash never leaves the db
// layer except via findByEmail (needed for credential checks).
const PUBLIC_COLS = 'id, email, display_name, role, must_change_password';

export async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS}, password_hash FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listAll() {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLS} FROM users ORDER BY id`
  );
  return rows;
}

export async function create({ email, displayName, role, hash, mustChange }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLS}`,
    [email, hash, displayName, role, mustChange]
  );
  return rows[0];
}

export async function updateProfile(id, displayName) {
  const { rows } = await pool.query(
    `UPDATE users SET display_name = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${PUBLIC_COLS}`,
    [id, displayName]
  );
  return rows[0] ?? null;
}

export async function updateRole(id, role) {
  const { rows } = await pool.query(
    `UPDATE users SET role = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${PUBLIC_COLS}`,
    [id, role]
  );
  return rows[0] ?? null;
}

export async function updatePassword({ id, hash, mustChange }) {
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $2, must_change_password = $3, updated_at = now()
     WHERE id = $1
     RETURNING ${PUBLIC_COLS}`,
    [id, hash, mustChange]
  );
  return rows[0] ?? null;
}

export async function deleteById(id) {
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function deleteSessionsForUser(id) {
  await pool.query(
    `DELETE FROM "session" WHERE (sess->'user'->>'id')::int = $1`,
    [id]
  );
}

// Demotions and deletions of admins must be atomic with the "is this the last
// admin?" check — two concurrent requests could otherwise each see two admins
// and remove both. The advisory lock serializes these rare admin mutations.
async function withAdminLock(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(874321)');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function demoteAdminGuarded(id) {
  return withAdminLock(async (client) => {
    const { rows } = await client.query(
      `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`,
      [id]
    );
    const target = rows[0];
    if (!target) return { ok: false, reason: 'NOT_FOUND' };
    if (target.role === 'admin') {
      const { rows: counted } = await client.query(
        `SELECT count(*)::int AS n FROM users WHERE role = 'admin'`
      );
      if (counted[0].n <= 1) return { ok: false, reason: 'LAST_ADMIN' };
    }
    const { rows: updated } = await client.query(
      `UPDATE users SET role = 'user', updated_at = now()
       WHERE id = $1
       RETURNING ${PUBLIC_COLS}`,
      [id]
    );
    return { ok: true, user: updated[0] };
  });
}

export async function deleteUserGuarded(id) {
  return withAdminLock(async (client) => {
    const { rows } = await client.query(
      `SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`,
      [id]
    );
    const target = rows[0];
    if (!target) return { ok: false, reason: 'NOT_FOUND' };
    if (target.role === 'admin') {
      const { rows: counted } = await client.query(
        `SELECT count(*)::int AS n FROM users WHERE role = 'admin'`
      );
      if (counted[0].n <= 1) return { ok: false, reason: 'LAST_ADMIN' };
    }
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    await client.query(
      `DELETE FROM "session" WHERE (sess->'user'->>'id')::int = $1`,
      [id]
    );
    return { ok: true };
  });
}
