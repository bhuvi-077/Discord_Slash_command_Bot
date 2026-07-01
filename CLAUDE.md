# CLAUDE.md

Context for AI assistants working on this repository.

## What this is
A Discord slash-command bot (Express + Postgres backend, React admin dashboard) deployed to Render. See `README.md` for the full architecture and setup steps.

## Non-negotiable rules when editing this codebase

1. **Never relax the `/interactions` raw-body handling.** That route must receive the unparsed request body (`express.raw({ type: 'application/json' })`) before any signature verification happens, and `JSON.parse` must only run *inside* `verifyDiscordSignature` after the Ed25519 check passes. Re-serializing `req.body` and signing/verifying that is wrong — see `AI_NOTES.md` for why this specific mistake happened once already.

2. **Never log or expose secrets.** `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `MIRROR_WEBHOOK_URL`, `GROQ_API_KEY`, and `GEMINI_API_KEY` must never appear in `console.log`, client-side code/bundles, or committed files. They're read from `process.env` only. If you add a new secret, add it to `.env.example` with a placeholder, not a real value.

3. **Respect Discord's ~3 second response window.** Any new command handler must either respond synchronously and fast, or use the defer pattern already established in `src/routes/interactions.js` (`DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` immediately, then `editInteractionResponse` after async work). Don't `await` slow work (AI calls, webhook POSTs) before the first response.

4. **Every new interaction-bearing route needs dedup.** Use the same `INSERT ... ON CONFLICT (id) DO NOTHING` pattern against the `interactions` table (keyed on Discord's interaction ID) before processing — don't process twice on Discord's retried deliveries.

5. **Don't introduce client-side or in-memory-only state for anything that needs to survive a redeploy** (sessions, command configs, logs). This app assumes Render's free tier can restart or spin down the process at any time; Postgres is the source of truth.

## Code style
- CommonJS (`require`/`module.exports`) on the backend, not ESM — matches the rest of `src/`.
- Functional React components with hooks, no class components.
- Inline `<style>` blocks scoped per-component (not CSS modules or a framework) — matches the existing dashboard components. Keep this convention unless doing a deliberate refactor.
- Prefer small, single-purpose utility modules under `src/utils/` over adding logic directly to route handlers.

## Where things live
- `src/routes/interactions.js` — Discord command logic (the core of the app)
- `src/middleware/verifyDiscord.js` — signature verification (security-critical, see rule 1)
- `src/utils/` — AI (Groq/Gemini), mirror webhooks, Discord REST helpers
- `scripts/setup-db.js` — schema; run after any schema change
- `client/src/pages/DashboardPage.js` — main dashboard orchestration; most new dashboard features start here

## If you didn't use an AI context file like this before
This file was written as part of the original build to satisfy the project brief's requirement to include AI context/instruction files "exactly as used." It reflects the actual constraints discovered while building (see `AI_NOTES.md` for the specific incident behind rule 1), not a generic template.
