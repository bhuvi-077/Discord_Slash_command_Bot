const express = require('express');
const router = express.Router();

/**
 * POST /auth/login
 * Simple credential check against env vars (single admin, as specified in brief
 * — "login for a throwaway admin account"). For multi-admin you'd hash+store in DB.
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (!validUsername || !validPassword) {
    console.error('[Auth] ADMIN_USERNAME/PASSWORD not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (username === validUsername && password === validPassword) {
    req.session.isAdmin = true;
    req.session.username = username;
    return res.json({ success: true, username });
  }

  console.warn(`[Auth] Failed login attempt for username: ${username}`);
  return res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Logout error:', err.message);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  if (req.session?.isAdmin) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  return res.json({ authenticated: false });
});

module.exports = router;
