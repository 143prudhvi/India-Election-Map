import * as users from '../db/users.js';

// Loads a fresh user row on every request so role/must_change_password
// changes (and deletions) take effect immediately, not at next login.
export function requireAuth({ allowMustChange = false } = {}) {
  return async (req, res, next) => {
    try {
      const id = req.session?.user?.id;
      if (!id) {
        return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
      }
      const user = await users.findById(id);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
      }
      if (user.must_change_password && !allowMustChange) {
        return res.status(403).json({ error: 'You must change your password first', code: 'MUST_CHANGE_PASSWORD' });
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAdmin() {
  const auth = requireAuth();
  return (req, res, next) => {
    auth(req, res, (err) => {
      if (err) return next(err);
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
      }
      next();
    });
  };
}
