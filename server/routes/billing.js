import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth, isPro } from '../middleware/auth.js';
import * as subscriptions from '../db/subscriptions.js';

const {
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_PLAN_ID: PLAN_ID,
  RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
} = process.env;

// Billing is only "on" when we can actually create a checkout: key pair + plan.
// When any is missing the app degrades to admin-granted Pro only.
export function billingEnabled() {
  return Boolean(KEY_ID && KEY_SECRET && PLAN_ID);
}

// Minimal Razorpay REST client: Basic-auth with the key pair, JSON in/out.
// Throws with Razorpay's own error description on a non-2xx response.
async function rzp(path, method = 'GET', body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64'),
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const message =
      (json && json.error && json.error.description) ||
      `Razorpay request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

const router = Router();

// Public: lets the client decide whether to show the pay button and gives it
// the (publishable) key id it needs to open Razorpay checkout.
router.get('/config', (req, res) => {
  const enabled = billingEnabled();
  res.json({
    enabled,
    keyId: enabled ? KEY_ID : null,
    planId: enabled ? PLAN_ID : null,
  });
});

router.get('/status', requireAuth(), async (req, res, next) => {
  try {
    const subscription = await subscriptions.getForUser(req.user.id);
    res.json({ tier: req.user.tier, subscription });
  } catch (err) {
    next(err);
  }
});

router.post('/subscribe', requireAuth(), async (req, res, next) => {
  try {
    if (isPro(req.user)) {
      return res.status(400).json({ error: 'Already Pro' });
    }
    if (!billingEnabled()) {
      return res
        .status(503)
        .json({ error: 'Billing is not configured', code: 'BILLING_DISABLED' });
    }

    const sub = await rzp('/subscriptions', 'POST', {
      plan_id: PLAN_ID,
      total_count: 12,
      customer_notify: 1,
      notes: { user_id: String(req.user.id) },
    });

    // Record the pending subscription so the webhook can reconcile it even if
    // notes.user_id is ever missing from the event payload.
    await subscriptions.upsertPending(req.user.id, sub.id);

    res.json({ subscriptionId: sub.id, keyId: KEY_ID });
  } catch (err) {
    next(err);
  }
});

// --- Webhook ---------------------------------------------------------------
// Mounted SEPARATELY with express.raw so req.body is the raw Buffer we need for
// signature verification. See the wiring note in the accompanying message.
export async function webhookHandler(req, res) {
  try {
    if (!WEBHOOK_SECRET) {
      return res.status(503).json({ error: 'Webhook secret not configured' });
    }

    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? '');
    const signature = req.get('x-razorpay-signature') || '';
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(raw.toString('utf8'));
    const entity = event?.payload?.subscription?.entity ?? null;
    const type = event?.event;

    if (entity) {
      const subId = entity.id;
      const userId = Number(entity.notes?.user_id) || null;
      // current_end is a unix seconds timestamp on the Razorpay subscription.
      const periodEnd = entity.current_end
        ? new Date(entity.current_end * 1000).toISOString()
        : null;

      if (type === 'subscription.activated' || type === 'subscription.charged') {
        let resolvedUserId = userId;
        if (!resolvedUserId) {
          const existing = await subscriptions.getByProviderId(subId);
          resolvedUserId = existing?.user_id ?? null;
        }
        if (resolvedUserId) {
          await subscriptions.upsertActive(resolvedUserId, subId, periodEnd);
        }
      } else if (
        type === 'subscription.cancelled' ||
        type === 'subscription.halted' ||
        type === 'subscription.completed' ||
        type === 'subscription.expired'
      ) {
        const status = type.split('.')[1]; // cancelled | halted | completed | expired
        await subscriptions.markStatus(subId, status);
      }
    }

    // Acknowledge every verified event; unknown types are simply ignored.
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Razorpay retries on non-2xx, which would replay the (possibly partial)
    // side effects. Log and ack instead.
    console.error('Razorpay webhook error:', err.message);
    return res.status(200).json({ ok: true });
  }
}

export default router;
