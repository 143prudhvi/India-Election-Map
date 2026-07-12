import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as apiKeys from '../db/apiKeys.js';
import * as data from '../db/electionData.js';

// Public programmatic data API. Mounted BEFORE the session middleware, so it is
// authenticated solely by API key (X-API-Key or Authorization: Bearer). It is
// meant to be called from arbitrary external apps, hence the permissive CORS.
const router = Router();

// CORS: this is a public read-only data API, so any origin may call it.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function readKey(req) {
  const header = req.get('X-API-Key');
  if (header) return header.trim();
  const auth = req.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return null;
}

// Owner qualifies for paid access. Mirrors isPro() but the API-key row only
// carries role + tier, not a full user object.
function ownerIsPro(row) {
  return row.role === 'admin' || row.tier === 'pro';
}

async function keyAuth(req, res, next) {
  try {
    const plaintext = readKey(req);
    if (!plaintext) {
      return res.status(401).json({ error: 'API key required', code: 'NO_API_KEY' });
    }
    const row = await apiKeys.findActiveByPlaintext(plaintext);
    if (!row) {
      return res.status(401).json({ error: 'Invalid API key', code: 'BAD_API_KEY' });
    }
    if (!ownerIsPro(row)) {
      return res.status(403).json({ error: 'API access requires Pro', code: 'PRO_REQUIRED' });
    }
    req.apiKeyId = row.id;
    apiKeys.touchLastUsed(row.id); // fire-and-forget
    next();
  } catch (err) {
    next(err);
  }
}

router.use(keyAuth);

// Rate limit AFTER auth, per key (so one abusive key can't starve others).
router.use(
  rateLimit({
    windowMs: 60000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.apiKeyId),
    message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
  })
);

// Resolve + validate :state/:year against the manifest so these params can
// never reach anything not explicitly loaded into the database.
async function resolveStateYear(req) {
  if (!/^[0-9]{4}$/.test(req.params.year)) return null;
  const year = Number(req.params.year);
  const manifest = await data.getManifest();
  const st = manifest.find((s) => s.slug === req.params.state);
  return st && st.years.includes(year) ? { slug: st.slug, year } : null;
}

router.get('/states', async (req, res, next) => {
  try {
    res.json(await data.getManifest());
  } catch (err) {
    next(err);
  }
});

router.get('/parties', async (req, res, next) => {
  try {
    res.json(await data.getParties());
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/results', async (req, res, next) => {
  try {
    const sy = await resolveStateYear(req);
    if (!sy) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const view = await data.getResults(sy.slug, sy.year);
    if (!view) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.json(view);
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/summary', async (req, res, next) => {
  try {
    const sy = await resolveStateYear(req);
    if (!sy) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    const view = await data.getResults(sy.slug, sy.year);
    if (!view) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    res.json({ state: sy.slug, year: sy.year, summary: view.summary });
  } catch (err) {
    next(err);
  }
});

export default router;
