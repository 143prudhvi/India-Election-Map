import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as data from '../db/electionData.js';

const router = Router();
router.use(requireAuth());

function notFound(res) {
  res.status(404).json({ error: 'Unknown state or year', code: 'NOT_FOUND' });
}

// Manifest lookups are the only path to data, so :state/:year can never
// reach anything that wasn't explicitly loaded into the database.
async function resolveStateYear(req) {
  if (!/^[0-9]{4}$/.test(req.params.year)) return null;
  const year = Number(req.params.year);
  const manifest = await data.getManifest();
  const st = manifest.find((s) => s.slug === req.params.state);
  return st && st.years.includes(year) ? { slug: st.slug, year } : null;
}

router.get('/states', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-cache');
    res.json(await data.getManifest());
  } catch (err) {
    next(err);
  }
});

router.get('/parties', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-cache');
    res.json(await data.getParties());
  } catch (err) {
    next(err);
  }
});

router.get('/:state/boundary', async (req, res, next) => {
  try {
    const boundary = await data.getBoundary(req.params.state);
    if (!boundary) return notFound(res);
    // Boundaries are effectively immutable; results/parties are editable so
    // they revalidate (no-cache + ETag -> 304s).
    res.set('Cache-Control', 'private, max-age=604800');
    res.json(boundary);
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/results', async (req, res, next) => {
  try {
    const sy = await resolveStateYear(req);
    if (!sy) return notFound(res);
    res.set('Cache-Control', 'private, no-cache');
    res.json(await data.getResults(sy.slug, sy.year));
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/summary', async (req, res, next) => {
  try {
    const sy = await resolveStateYear(req);
    if (!sy) return notFound(res);
    const view = await data.getResults(sy.slug, sy.year);
    res.set('Cache-Control', 'private, no-cache');
    res.json({ state: sy.slug, year: sy.year, summary: view.summary });
  } catch (err) {
    next(err);
  }
});

export default router;
