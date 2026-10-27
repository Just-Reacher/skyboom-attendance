const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const config = require('./config');
const db = require('./db');
const { csrf, pageGuard } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/error');
const users = require('./repositories/users');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
  frameAncestors: ["'none'"], formAction: ["'self'"], objectSrc: ["'none'"],
  upgradeInsecureRequests: config.isProd ? [] : null } } }));
app.use((req, res, next) => { res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()'); next(); });
app.use(express.json({ limit: '50kb' }));
app.use(session({
  store: new PgStore({ pool: db.pool, tableName: 'session' }),
  name: 'skyboom.sid', secret: config.sessionSecret, resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: config.sessionHours * 3600e3 },
}));

app.get('/healthz', async (req, res) => { try { await db.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.use('/api', csrf, require('./routes'));

app.use('/assets', express.static(path.join(__dirname, '../public'), { maxAge: config.isProd ? '1h' : 0 }));
const view = (f) => (req, res) => res.sendFile(path.join(__dirname, '../views', f));
  app.get('/', view('index.html'));
  
app.get('/login', view('login.html'));
app.get('/staff', pageGuard('staff'), view('staff.html'));
app.get('/admin', pageGuard('admin'), view('admin.html'));
app.get('/403', view('403.html'));
app.use(notFound);
app.use(errorHandler);
module.exports = app;
