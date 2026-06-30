/**
 * Middleware to protect admin dashboard routes.
 * Checks for an active session with isAdmin = true.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized', redirectTo: '/login' });
  }
  return res.redirect('/login');
}

/**
 * Middleware for login route — redirect to dashboard if already logged in.
 */
function redirectIfAuthed(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, redirectIfAuthed };
