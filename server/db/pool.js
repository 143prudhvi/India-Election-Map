import pg from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'Missing DATABASE_URL. Set it in .env, e.g.\n' +
      '  DATABASE_URL=postgres://user:password@localhost:5432/india_election_map'
  );
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

export const pool = new pg.Pool({
  connectionString,
  ssl: isLocal(connectionString) ? false : { rejectUnauthorized: false },
});

// Managed Postgres kills idle connections during maintenance/failover; the
// pool emits 'error' for those, and without a listener the process dies.
pool.on('error', (err) => {
  console.error('Idle Postgres client error:', err.message);
});
