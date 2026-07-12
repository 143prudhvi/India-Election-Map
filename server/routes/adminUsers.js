import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import * as users from '../db/users.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const BCRYPT_COST = 12;

const router = Router();
router.use(requireAdmin());

const createSchema = z.object({
  email: z.email(),
  display_name: z.string().trim().max(200, 'Display name is too long'),
  role: z.enum(['admin', 'user']),
});

const patchSchema = z.object({
  display_name: z.string().trim().max(200, 'Display name is too long').optional(),
  role: z.enum(['admin', 'user']).optional(),
});

function newTempPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function parseId(req, res) {
  const id = Number(req.params.id);
  // Upper bound keeps out-of-int4-range ids from becoming Postgres 22003 -> 500s.
  if (!/^\d+$/.test(req.params.id) || id < 1 || id > 2147483647) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return null;
  }
  return id;
}

router.get('/', async (req, res, next) => {
  try {
    res.json({ users: await users.listAll() });
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createSchema), async (req, res, next) => {
  try {
    const tempPassword = newTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
    const user = await users.create({
      email: req.body.email,
      displayName: req.body.display_name,
      role: req.body.role,
      hash,
      mustChange: true,
    });
    res.status(201).json({ user, temp_password: tempPassword });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    next(err);
  }
});

router.patch('/:id', validate(patchSchema), async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const { display_name, role } = req.body;

    let user = await users.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    }
    if (role !== undefined && id === req.user.id && role !== req.user.role) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    if (display_name !== undefined) {
      user = await users.updateProfile(id, display_name);
    }
    if (role === 'user' && user.role === 'admin') {
      // Atomic with the last-admin check — see users.demoteAdminGuarded.
      const result = await users.demoteAdminGuarded(id);
      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') {
          return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
        }
        return res.status(400).json({ error: 'Cannot demote the last admin' });
      }
      user = result.user;
    } else if (role !== undefined && role !== user.role) {
      user = await users.updateRole(id, role);
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }
    // Atomic with the last-admin check — see users.deleteUserGuarded.
    const result = await users.deleteUserGuarded(id);
    if (!result.ok) {
      if (result.reason === 'NOT_FOUND') {
        return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
      }
      return res.status(400).json({ error: 'Cannot delete the last admin' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const id = parseId(req, res);
    if (id === null) return;
    const target = await users.findById(id);
    if (!target) {
      return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    }
    const tempPassword = newTempPassword();
    const hash = await bcrypt.hash(tempPassword, BCRYPT_COST);
    await users.updatePassword({ id, hash, mustChange: true });
    await users.deleteSessionsForUser(id); // force re-login with the temp password
    res.json({ temp_password: tempPassword });
  } catch (err) {
    next(err);
  }
});

export default router;
