import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { ZodError } from 'zod';
import { pool } from './db/pool.js';
import authRouter from './routes/auth.js';
import profileRouter from './routes/profile.js';
import adminUsersRouter from './routes/adminUsers.js';
import adminDataRouter from './routes/adminData.js';
import dataRouter from './routes/data.js';
import apiV1Router from './routes/apiV1.js';
import apiKeysRouter from './routes/apiKeys.js';
import publicDataRouter from './routes/publicData.js';
import billingRouter, { webhookHandler } from './routes/billing.js';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add a long random string to .env.');
}

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());

// Razorpay webhook needs the RAW body for HMAC signature verification, so it
// must be registered before any JSON body parser.
app.post('/api/billing/webhook', express.raw({ type: '*/*' }), webhookHandler);

// API-key-authenticated data API and the flagged public map data need no
// session cookie — mount them before the session middleware.
app.use('/api/v1', apiV1Router);
app.use('/api/public', publicDataRouter);

// Small default body cap; /api/admin/data parses its own bodies (election
// imports run to megabytes), so the strict parser must not see them first.
const smallJson = express.json({ limit: '10kb' });
app.use((req, res, next) => {
  if (req.path.startsWith('/api/admin/data')) return next();
  smallJson(req, res, next);
});

const PgStore = connectPgSimple(session);
app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    },
  })
);

// Unauthenticated on purpose: Render's health check probes this.
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/data', adminDataRouter);
app.use('/api/data', dataRouter);
app.use('/api/keys', apiKeysRouter);
app.use('/api/billing', billingRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

const CLIENT_DIST = path.resolve(import.meta.dirname, '../client/dist');
const INDEX_HTML = path.join(CLIENT_DIST, 'index.html');

// Only Vite's content-hashed /assets/* files are safe to cache forever; a
// blanket immutable policy would let a stale /index.html pin an old bundle.
const ASSETS_DIR = path.join(CLIENT_DIST, 'assets') + path.sep;
app.use(
  express.static(CLIENT_DIST, {
    index: false,
    setHeaders(res, filePath) {
      res.setHeader(
        'Cache-Control',
        filePath.startsWith(ASSETS_DIR) ? 'public, max-age=31536000, immutable' : 'no-cache'
      );
    },
  })
);

// SPA fallback. Express 5 removed the app.get('*') pattern; a plain use()
// after the static handler catches everything that is not a file.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!fs.existsSync(INDEX_HTML)) {
    return res
      .status(404)
      .type('text/plain')
      .send(
        'Client build not found. In development the client runs on the Vite dev server ' +
          '(npm run dev); for production run "npm run build" first.'
      );
  }
  res.sendFile(INDEX_HTML, {
    cacheControl: false,
    headers: { 'Cache-Control': 'no-cache' },
  });
});

// Central error handler.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
  }
  // body-parser errors (malformed JSON, payload too large) carry expose+status
  if (err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
