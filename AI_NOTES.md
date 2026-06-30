# AI_NOTES.md

## Tools and model used
Claude (Anthropic), via the Claude.ai chat interface with the code-execution/file-creation tool. Roughly a 90/10 split: I (the AI) wrote the full scaffold — backend routes, middleware, DB schema, React dashboard, docs — in one continuous session, with the human steering scope, priorities, and approving the plan at checkpoints. The human's role was architectural sign-off and "keep going" direction rather than line-by-line code review during this session; that review now needs to happen before this is submitted as real work.

## 2–3 key decisions and why

**1. Defer-then-edit instead of synchronous reply for every command.**
Discord gives ~3 seconds to respond. AI triage (Gemini) alone can take 1–3 seconds, plus a DB write and a mirror POST with retries. Rather than try to keep everything under budget, every command responds with `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` immediately, then does the real work in a `setImmediate` callback and edits the response via the followup webhook. This trades a half-second "Bot is thinking…" flicker for never timing out, which matters more once AI or a flaky webhook is in the path.

**2. Interaction ID as the dedup primary key, not a separate "seen" cache.**
Discord retries delivery if it doesn't get a fast enough ack, so the same interaction can arrive twice. Instead of an in-memory `Set` of seen IDs (which dies on restart and doesn't work if you ever run more than one instance), the `interactions` table uses the Discord interaction ID as its primary key, and the dedup check is a single `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id` — if zero rows come back, it's a duplicate. This is also free observability: the log already has a row for every attempt, even ones that didn't process.

**3. Sessions in Postgres, not JWT or in-memory.**
Render's free tier can restart the dyno; in-memory sessions would log everyone out on every deploy or idle-spin-down. `connect-pg-simple` puts session data in the same Postgres instance as everything else, so one less moving part, and `npm run setup:db` provisions the session table alongside the app tables.

## The hardest part — raw body vs. JSON body for signature verification

This was the one place where an AI-typical mistake actually happened during this build, and it's worth being specific about it because it would have silently broken the most security-critical part of the app.

The first draft of `src/index.js` used `app.use(express.json())` globally, then the `/interactions` route relied on `req.body` (already parsed) to do Ed25519 verification by re-serializing it with `JSON.stringify(req.body)` and signing that. **This is wrong, and it's a subtle wrong** — it doesn't fail loudly, it just produces a byte string that doesn't always match what Discord actually signed (key ordering, whitespace, and numeric formatting can all differ between Discord's original JSON and Express's re-serialized version). Some requests would verify correctly by coincidence; others wouldn't, intermittently — exactly the kind of bug that passes initial manual testing and then fails unpredictably in production, which is worse than failing every time.

**How I noticed:** instead of trusting the code "looked right," I wrote an actual Ed25519 test — generated a real keypair with `tweetnacl`, signed a `{"type":1}` PING payload the way Discord does (`timestamp + rawBody`), and sent it through the real Express app with curl/http. The first version intermittently rejected valid signatures. That forced tracing the exact bytes being verified versus the bytes Discord (or my test) actually signed.

**The fix:** `/interactions` now gets its own middleware chain *before* the global JSON parser — `express.raw({ type: 'application/json' })` captures the literal byte buffer, that buffer is what gets passed into `nacl.sign.detached.verify()`, and `JSON.parse()` only happens *after* the signature is confirmed valid (in `verifyDiscordSignature`, not in a generic body parser). I then re-ran the test harness with both a validly-signed PING (got `200`/PONG) and a forged signature (got `401`), and ran that test in the actual execution environment, not just visually inspected the code, before considering it done.

The general lesson, which generalizes past this one bug: anywhere a signature, HMAC, or checksum is being verified, the exact bytes matter, and "parse then re-serialize then sign" is a trap that AI-generated code (including mine, on the first pass) reaches for by default because `req.body` is the convenient/idiomatic Express object to work with. The fix is always "verify on the wire format, parse after."

## What I'd improve or add with more time
- **Button and modal interactions** (the two other stretch goals) — the signature verification and dedup path already generalize to `MESSAGE_COMPONENT` and `MODAL_SUBMIT`, so this is mostly new handler logic, not new infrastructure.
- **Per-server admin accounts** instead of one shared admin login, so multi-server isolation (a stretch goal) is actually enforced rather than just data-modeled.
- **Structured JSON logging** (e.g., pino) instead of `console.log`/`console.error`, so Render's log output is queryable rather than just readable.
- **Idempotency on the mirror step specifically** — right now a retried mirror POST after a partial network failure could in rare cases send twice; the interaction-level dedup prevents reprocessing the whole command, but the mirror call itself isn't separately idempotent.
- **Automated tests** — the testing done during this build was manual/scripted Ed25519 verification and a few curl checks, not a real test suite. For a 72-hour exercise that's a defensible tradeoff, but it's the first thing to add for anything longer-lived.
