import { Router } from 'express';
import bcrypt from 'bcrypt';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import * as users from '../db/users.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const BCRYPT_COST = 12;

// Compared against when the email is unknown, so login timing does not
// reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-placeholder', BCRYPT_COST);

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(10, 'New password must be at least 10 characters'),
});

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role: u.role,
    tier: u.tier,
    must_change_password: u.must_change_password,
  };
}

function regenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

router.post('/login', loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await users.findByEmail(email);
    // Always run bcrypt.compare to keep timing flat for unknown emails.
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await regenerate(req); // fresh session id prevents fixation
    req.session.user = { id: user.id };
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAuth({ allowMustChange: true }), (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.status(204).end();
  });
});

router.get('/me', requireAuth({ allowMustChange: true }), (req, res) => {
  res.json({ user: req.user });
});

router.post(
  '/change-password',
  requireAuth({ allowMustChange: true }),
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const row = await users.findByEmail(req.user.email);
      const ok = await bcrypt.compare(req.body.current_password, row.password_hash);
      if (!ok) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const hash = await bcrypt.hash(req.body.new_password, BCRYPT_COST);
      await users.updatePassword({ id: req.user.id, hash, mustChange: false });
      // Revoke every session for this user (including any on other devices —
      // the point of a password change), then mint a fresh one to stay logged in.
      await users.deleteSessionsForUser(req.user.id);
      await regenerate(req);
      req.session.user = { id: req.user.id };
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

export default router;
