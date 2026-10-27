const crypto = require('crypto');
const users = require('../repositories/users');
const { AppError } = require('../utils/errors');

const ALLOWED_WHEN_PASSWORD_CHANGE_PENDING = ['/api/auth/me', '/api/auth/password', '/api/auth/logout', '/api/auth/csrf'];

// Loads the user from the database on every request: role/status come from the DB, never the client.
async function requireAuth(req, res, next) {
  try {
    const sid = req.session && req.session.user;
    if (!sid) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue.');
    const user = await users.byId(sid.id);
    if (!user || user.status !== 'active') {
      await new Promise((r) => req.session.destroy(r));
      throw new AppError(401, 'AUTH_REQUIRED', 'Your session is no longer valid. Please log in again.');
    }
    if (user.must_change_password && !ALLOWED_WHEN_PASSWORD_CHANGE_PENDING.includes(req.originalUrl.split('?')[0]))
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing.');
    req.user = user;
    next();
  } catch (e) { next(e); }
}
const requireRole = (role) => [requireAuth, (req, res, next) =>
  req.user.role === role ? next() : next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do this.'))];

// Synchronizer-token CSRF protection for every state-changing request.
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(String(req.get('x-csrf-token') || ''));
  const have = Buffer.from(String((req.session && req.session.csrf) || ''));
  if (!have.length || sent.length !== have.length || !crypto.timingSafeEqual(sent, have))
    return next(new AppError(403, 'CSRF_INVALID', 'Security token missing or expired. Refresh the page and try again.'));
  next();
}

// For HTML pages: redirect instead of returning JSON.
const pageGuard = (role) => async (req, res, next) => {
  try {
    const sid = req.session && req.session.user;
    if (!sid) return res.redirect('/login');
    const user = await users.byId(sid.id);
    if (!user || user.status !== 'active') return res.redirect('/login');
    if (role && user.role !== role) return res.redirect('/403');
    next();
  } catch (e) { next(e); }
};
module.exports = { requireAuth, requireRole, csrf, pageGuard };
