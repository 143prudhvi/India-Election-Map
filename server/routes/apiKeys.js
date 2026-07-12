import { Router } from 'express';
import { z } from 'zod';
import { requirePro } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as apiKeys from '../db/apiKeys.js';

// Session-authed management surface for a Pro user's own API keys.
const router = Router();
router.use(requirePro());

router.get('/', async (req, res, next) => {
  try {
    res.json({ keys: await apiKeys.listKeys(req.user.id) });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  validate(z.object({ name: z.string().trim().max(60).default('') })),
  async (req, res, next) => {
    try {
      const { row, plaintext } = await apiKeys.createKey(req.user.id, req.body.name);
      res.status(201).json({ key: row, plaintext });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    if (!/^[0-9]+$/.test(req.params.id)) {
      return res.status(404).json({ error: 'Key not found', code: 'NOT_FOUND' });
    }
    const ok = await apiKeys.revokeKey(Number(req.params.id), req.user.id);
    if (!ok) return res.status(404).json({ error: 'Key not found', code: 'NOT_FOUND' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
