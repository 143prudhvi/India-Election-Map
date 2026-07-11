// Standalone seeder: creates the first admin account.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=changeme123 npm run seed:admin
import bcrypt from 'bcrypt';
import pg from 'pg';

const { ADMIN_EMAIL, ADMIN_PASSWORD, DATABASE_URL } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error(
    'Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=<password> npm run seed:admin'
  );
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL. Set it in .env.');
  process.exit(1);
}

function isLocal(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/.test(url);
  }
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: isLocal(DATABASE_URL) ? false : { rejectUnauthorized: false },
});

try {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const { rowCount } = await pool.query(
    `INSERT INTO users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, 'admin', TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [ADMIN_EMAIL, hash]
  );
  console.log(
    rowCount > 0
      ? `Created admin ${ADMIN_EMAIL} (password change required at first login).`
      : `User ${ADMIN_EMAIL} already exists; nothing changed.`
  );
} finally {
  await pool.end();
}
