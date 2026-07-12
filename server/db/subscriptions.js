import { pool } from './pool.js';
import * as users from './users.js';

// Statuses that mean the subscription no longer entitles the user to Pro.
const INACTIVE_STATUSES = new Set(['cancelled', 'halted', 'completed', 'expired']);

const COLS =
  'id, user_id, provider, provider_subscription_id, status, current_period_end, created_at, updated_at';

// Latest subscription row for a user, or null. Never throws on a missing row.
export async function getForUser(userId) {
  if (!userId) return null;
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM subscriptions
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

// Insert (or update, keyed on provider_subscription_id) an ACTIVE subscription
// and promote the user to Pro — atomically, so we never leave a user marked Pro
// without a matching active row (or vice versa).
export async function upsertActive(userId, providerSubscriptionId, currentPeriodEnd) {
  if (!userId || !providerSubscriptionId) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO subscriptions (user_id, provider_subscription_id, status, current_period_end)
       VALUES ($1, $2, 'active', $3)
       ON CONFLICT (provider_subscription_id)
       DO UPDATE SET status = 'active',
                     current_period_end = EXCLUDED.current_period_end,
                     user_id = EXCLUDED.user_id,
                     updated_at = now()
       RETURNING ${COLS}`,
      [userId, providerSubscriptionId, currentPeriodEnd ?? null]
    );
    await client.query(
      `UPDATE users SET tier = 'pro', updated_at = now() WHERE id = $1`,
      [userId]
    );
    await client.query('COMMIT');
    return rows[0] ?? null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Fetch a subscription by its Razorpay id (used by the webhook to resolve the
// owning user when the event payload lacks notes.user_id). Never throws.
export async function getByProviderId(providerSubscriptionId) {
  if (!providerSubscriptionId) return null;
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM subscriptions WHERE provider_subscription_id = $1`,
    [providerSubscriptionId]
  );
  return rows[0] ?? null;
}

// Record a freshly created (not yet paid) subscription so the webhook can map
// its id back to a user. Idempotent on provider_subscription_id; never demotes
// an already-active row back to 'created'.
export async function upsertPending(userId, providerSubscriptionId) {
  if (!userId || !providerSubscriptionId) return null;
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (user_id, provider_subscription_id, status)
     VALUES ($1, $2, 'created')
     ON CONFLICT (provider_subscription_id)
     DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()
     RETURNING ${COLS}`,
    [userId, providerSubscriptionId]
  );
  return rows[0] ?? null;
}

// Update a subscription's status. If the new status is a terminal/inactive one
// AND this row is still the user's latest subscription, demote them to free.
// Returns the affected user_id, or null when no such subscription exists.
export async function markStatus(providerSubscriptionId, status) {
  if (!providerSubscriptionId || !status) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE subscriptions
       SET status = $2, updated_at = now()
       WHERE provider_subscription_id = $1
       RETURNING id, user_id`,
      [providerSubscriptionId, status]
    );
    const row = rows[0];
    if (!row) {
      await client.query('COMMIT');
      return null;
    }

    if (INACTIVE_STATUSES.has(status)) {
      // Only demote if this is the user's most recent subscription — a newer
      // active one should keep them Pro.
      const { rows: latest } = await client.query(
        `SELECT id FROM subscriptions
         WHERE user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [row.user_id]
      );
      if (latest[0] && latest[0].id === row.id) {
        await client.query(
          `UPDATE users SET tier = 'free', updated_at = now() WHERE id = $1`,
          [row.user_id]
        );
      }
    }

    await client.query('COMMIT');
    return row.user_id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
