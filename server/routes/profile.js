import { Router } from 'express';
import { z } from 'zod';
import * as users from '../db/users.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const profileSchema = z.object({
  display_name: z.string().trim().max(200, 'Display name is too long'),
});

router.patch('/', requireAuth(), validate(profileSchema), async (req, res, next) => {
  try {
    const user = await users.updateProfile(req.user.id, req.body.display_name);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

export default router;
