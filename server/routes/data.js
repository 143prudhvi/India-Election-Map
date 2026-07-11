import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../../data');

const router = Router();
router.use(requireAuth());

// Lazy caches; the data files are immutable once the pipeline has run.
let manifestCache = null; // { states: [...], years: Map<slug, Set<year>> }
let partiesCache = null;
const summaryCache = new Map(); // "slug/year" -> summary object

async function getManifest() {
  if (!manifestCache) {
    const states = JSON.parse(await readFile(path.join(DATA_DIR, 'states.json'), 'utf8'));
    manifestCache = {
      states,
      years: new Map(states.map((s) => [s.slug, new Set(s.years)])),
    };
  }
  return manifestCache;
}

function notFound(res) {
  res.status(404).json({ error: 'Unknown state or year', code: 'NOT_FOUND' });
}

// Manifest lookups are the only path to a filename, so traversal via
// :state/:year is impossible.
async function checkState(req, res) {
  const { years } = await getManifest();
  if (!years.has(req.params.state)) {
    notFound(res);
    return false;
  }
  return true;
}

async function checkStateYear(req, res) {
  const { state, year } = req.params;
  if (!/^[0-9]{4}$/.test(year)) {
    notFound(res);
    return false;
  }
  const { years } = await getManifest();
  if (!years.get(state)?.has(Number(year))) {
    notFound(res);
    return false;
  }
  return true;
}

function sendDataFile(res, next, filePath, cacheControl) {
  // cacheControl:false stops sendFile writing its own public Cache-Control.
  res.sendFile(
    filePath,
    { cacheControl: false, headers: { 'Cache-Control': cacheControl } },
    (err) => {
      if (err) next(err);
    }
  );
}

router.get('/states', async (req, res, next) => {
  try {
    res.json((await getManifest()).states);
  } catch (err) {
    next(err);
  }
});

router.get('/parties', async (req, res, next) => {
  try {
    if (!partiesCache) {
      partiesCache = JSON.parse(await readFile(path.join(DATA_DIR, 'parties.json'), 'utf8'));
    }
    res.json(partiesCache);
  } catch (err) {
    next(err);
  }
});

router.get('/:state/boundary', async (req, res, next) => {
  try {
    if (!(await checkState(req, res))) return;
    const file = path.join(DATA_DIR, 'boundaries', `${req.params.state}.json`);
    sendDataFile(res, next, file, 'private, max-age=604800');
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/results', async (req, res, next) => {
  try {
    if (!(await checkStateYear(req, res))) return;
    const file = path.join(DATA_DIR, 'results', req.params.state, `${req.params.year}.json`);
    sendDataFile(res, next, file, 'private, max-age=3600');
  } catch (err) {
    next(err);
  }
});

router.get('/:state/:year/summary', async (req, res, next) => {
  try {
    if (!(await checkStateYear(req, res))) return;
    const { state, year } = req.params;
    const key = `${state}/${year}`;
    let summary = summaryCache.get(key);
    if (!summary) {
      const file = path.join(DATA_DIR, 'results', state, `${year}.json`);
      summary = JSON.parse(await readFile(file, 'utf8')).summary;
      summaryCache.set(key, summary);
    }
    res.json({ state, year: Number(year), summary });
  } catch (err) {
    next(err);
  }
});

// Missing data files mean the pipeline has not been run.
router.use((err, req, res, next) => {
  if (err?.code === 'ENOENT' && !res.headersSent) {
    return res.status(503).json({ error: 'Data not built. Run: npm run pipeline' });
  }
  next(err);
});

export default router;
