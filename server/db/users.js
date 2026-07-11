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

export async function countAdmins() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM users WHERE role = 'admin'`
  );
  return rows[0].n;
}

export async function deleteSessionsForUser(id) {
  await pool.query(
    `DELETE FROM "session" WHERE (sess->'user'->>'id')::int = $1`,
    [id]
  );
}
