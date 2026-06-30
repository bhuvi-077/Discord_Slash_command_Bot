const nacl = require('tweetnacl');

/**
 * Middleware to verify Discord's Ed25519 request signatures.
 * Discord signs every interaction with your app's public key.
 * If verification fails → 401 (Discord won't accept your endpoint otherwise).
 *
 * Must run on raw body (before JSON parse), so we use express.raw() for the
 * /interactions route specifically.
 */
function verifyDiscordSignature(req, res, next) {
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp) {
    console.warn('[Auth] Missing signature headers');
    return res.status(401).json({ error: 'Missing signature headers' });
  }

  // Replay protection: reject requests older than 5 minutes
  const requestTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > 300) {
    console.warn('[Auth] Stale timestamp, possible replay attack');
    return res.status(401).json({ error: 'Stale request' });
  }

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[Auth] DISCORD_PUBLIC_KEY not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  try {
    const body = req.rawBody; // set by raw body capture middleware
    const message = Buffer.from(timestamp + body);
    const sigBytes = Buffer.from(signature, 'hex');
    const keyBytes = Buffer.from(publicKey, 'hex');

    const isValid = nacl.sign.detached.verify(
      new Uint8Array(message),
      new Uint8Array(sigBytes),
      new Uint8Array(keyBytes)
    );

    if (!isValid) {
      console.warn('[Auth] Invalid Ed25519 signature — forged request rejected');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse body after successful verification
    req.body = JSON.parse(body);
    next();
  } catch (err) {
    console.error('[Auth] Signature verification error:', err.message);
    return res.status(401).json({ error: 'Signature verification failed' });
  }
}

module.exports = { verifyDiscordSignature };
