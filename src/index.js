require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { pool } = require('./db');
const { verifyDiscordSignature } = require('./middleware/verifyDiscord');
const { handleInteraction } = require('./routes/interactions');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Render's proxy (needed for secure cookies behind a load balancer)
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // relaxed for the React SPA; tighten if you add a CSP
}));
app.use(cors({
  origin: process.env.APP_URL,
  credentials: true,
}));

// ── Rate limiting ──────────────────────────────────────────────
// Protects /interactions and /auth/login from abuse.
const interactionsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120, // generous — a busy server can fire a lot of commands
  standardHeaders: true,
  legacyHeaders: false,
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again later' },
});

// ── CRITICAL: raw body capture for Discord signature verification ──
// Discord's Ed25519 signature is computed over the exact raw bytes of the
// request body. If we JSON.parse first and re-serialize, the bytes won't
// match and every request will fail verification. So this route gets
// express.raw() instead of express.json(), and verifyDiscordSignature
// parses req.body itself after confirming the signature is valid.
app.post(
  '/interactions',
  interactionsLimiter,
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body; // Buffer
    next();
  },
  verifyDiscordSignature,
  handleInteraction
);

// ── Normal JSON parsing for everything else ──────────────────────
app.use(express.json());

// ── Sessions (stored in Postgres so they survive restarts/scaling) ──
app.use(session({
  store: new pgSession({ pool, tableName: 'session' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
    sameSite: 'lax',
  },
}));

app.use('/auth', loginLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check (useful for Render + uptime monitors)
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Serve React build in production ──────────────────────────────
const clientBuildPath = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path === '/interactions') {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ── Global error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Interactions endpoint: ${process.env.APP_URL || 'http://localhost:' + PORT}/interactions`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing pool...');
  pool.end(() => process.exit(0));
});
