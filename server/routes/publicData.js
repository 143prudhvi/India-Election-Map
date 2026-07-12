import { Router } from 'express';
import * as data from '../db/electionData.js';

// Unauthenticated read-only map data, served ONLY when PUBLIC_ACCESS_ENABLED
// is 'true'. Mirrors the basic /api/data endpoints (states, parties, boundary,
// results, summary) — no analysis/history (those stay Pro). Mounted before the
// session middleware so it needs no cookie.
const router = Router();

function publicEnabled() {
  return process.env.PUBLIC_ACCESS_ENABLED === 'true';
}

router.use((req, res, next) => {
  if (!publicEnabled()) {
    return res.status(403).json({ error: 'Public access is disabled', code: 'PUBLIC_DISABLED' });
  }
  // Shareable/embeddable data — allow cross-origin GETs and short caching.
  res.set('Access-Control-Allow-Origin', '*');
  next();
});

function notFound(res) {
  res.status(404).json({ error: 'Unknown state or year', code: 'NOT_FOUND' });
}

async function resolveStateYear(req) {
  if (!/^[0-9]{4}$/.test(req.params.year)) return null;
  const year = Number(req.params.year);
  const manifest = await data.getManifest();
  const st = manifest.find((s) => s.slug === req.params.state);
  return st && st.years.includes(year) ? { slug: st.slug, year } : null;
}

router.get('/states', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await data.getManifest());
  } catch (err) {
    next(err);
  }
});

router.get('/parties', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await data.getParties());
  } catch (err) {
    next(err);
  }
});

router.get('/:state/boundary', async (req, res, next) => {
  try {
    const boundary = await data.getBoundary(req.params.state);
    if (!boundary) return notFound(res);
    res.set('Cache-Control', 'public, max-age=604800');
    res.json(boundary);
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/results', async (req, res, next) => {
  try {
    const sy = await resolveStateYear(req);
    if (!sy) return notFound(res);
    res.set('Cache-Control', 'public, max-age=300');
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
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ state: sy.slug, year: sy.year, summary: view.summary });
  } catch (err) {
    next(err);
  }
});

export default router;
