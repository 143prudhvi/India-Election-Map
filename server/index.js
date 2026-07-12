import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { seedIfEmpty } from '../scripts/seed-data.js';
import app from './app.js';

const port = Number(process.env.PORT) || 10000;

// Schema is idempotent and the seed only runs on an empty database, so a
// fresh deployment comes up with data and zero manual steps.
await runMigrations();
await seedIfEmpty(pool);

app.listen(port, () => {
  console.log(`India Election Map API listening on port ${port}`);
});
