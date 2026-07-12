import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import '../styles/upgrade.css';

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const PRO_FEATURES = [
  'Advanced seat & vote-share analysis',
  'Full historical seat-by-seat data',
  'What-if swing simulator',
  'Programmatic API access',
  'CSV / GeoJSON data exports',
];

// isPro mirror of the server middleware: admins and pro-tier users qualify.
function isPro(user) {
  return !!user && (user.role === 'admin' || user.tier === 'pro');
}

function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load checkout')));
      if (window.Razorpay) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function Upgrade() {
  const { user, refresh } = useAuth();
  const [config, setConfig] = useState(null); // { enabled, keyId, planId }
  const [status, setStatus] = useState(null); // { tier, subscription }
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null); // { type, text }
  const [done, setDone] = useState(false);

  const pro = isPro(user);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get('/api/billing/config').catch(() => ({ enabled: false })),
      api.get('/api/billing/status').catch(() => null),
    ]).then(([cfg, st]) => {
      if (!alive) return;
      setConfig(cfg);
      setStatus(st);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleUpgrade() {
    setNotice(null);
    setPending(true);
    try {
      const { subscriptionId, keyId } = await api.post('/api/billing/subscribe');
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Checkout unavailable — please retry.');

      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'India Election Map',
        description: 'Pro subscription',
        theme: { color: '#2563eb' },
        handler: async () => {
          try {
            await refresh();
            setDone(true);
            setNotice({ type: 'success', text: 'Payment received — welcome to Pro!' });
            const st = await api.get('/api/billing/status').catch(() => null);
            if (st) setStatus(st);
          } finally {
            setPending(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPending(false);
            setNotice({
              type: 'warn',
              text: 'Checkout closed. Your subscription activates once payment completes.',
            });
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        setPending(false);
        setNotice({
          type: 'error',
          text: (resp?.error && resp.error.description) || 'Payment failed. Please try again.',
        });
      });
      rzp.open();
    } catch (err) {
      setPending(false);
      setNotice({ type: 'error', text: err.message || 'Could not start checkout' });
    }
  }

  const subscription = status?.subscription;
  const renewsOn = formatDate(subscription?.current_period_end);

  if (pro || done) {
    return (
      <div className="page narrow-page">
        <h1 className="page-title">Upgrade to Pro</h1>
        <div className="card upgrade-card">
          <div className="upgrade-badge">Pro</div>
          <h2 className="card-title">You're on Pro</h2>
          <p className="card-hint">
            {user?.role === 'admin'
              ? 'Admin accounts include all Pro features.'
              : 'Thanks for supporting the project — everything is unlocked.'}
          </p>
          <ul className="feature-list">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="feature-row">
                <span className="feature-check" aria-hidden="true">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {subscription && (
            <p className="card-hint sub-status">
              Subscription status: <strong>{subscription.status}</strong>
              {renewsOn ? ` · renews ${renewsOn}` : ''}
            </p>
          )}
        </div>
      </div>
    );
  }

  const disabled = config ? config.enabled === false : true;

  return (
    <div className="page narrow-page">
      <h1 className="page-title">Upgrade to Pro</h1>
      <div className="card upgrade-card pricing-card">
        <div className="price-row">
          <span className="price-amount">₹499</span>
          <span className="price-period">/ month</span>
        </div>
        <p className="card-hint price-note">Placeholder pricing — billed monthly, cancel anytime.</p>

        <ul className="feature-list">
          {PRO_FEATURES.map((f) => (
            <li key={f} className="feature-row">
              <span className="feature-check" aria-hidden="true">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {notice && (
          <p
            className={
              notice.type === 'error'
                ? 'notice notice-error'
                : notice.type === 'warn'
                  ? 'notice notice-warn'
                  : 'notice notice-success'
            }
          >
            {notice.text}
          </p>
        )}

        <button
          className="btn btn-primary btn-upgrade"
          type="button"
          onClick={handleUpgrade}
          disabled={disabled || pending}
        >
          {pending ? 'Starting checkout…' : 'Upgrade'}
        </button>

        {disabled && (
          <p className="card-hint upgrade-disabled-note">
            Online payment isn't configured yet — contact an admin to enable Pro. (Admins can grant
            Pro from Admin → Users.)
          </p>
        )}
      </div>
    </div>
  );
}
