# Discord Slash-Command Bot — Command Deck

A full-stack app: a Discord bot that responds to slash commands, plus an admin web dashboard to monitor and configure it.

**Live URL:** `https://discord-slash-command-bot-quej.onrender.com`
**Repo:** `https://github.com/bhuvi-077/Discord_Slash_command_Bot`

---

## What it does

1. An admin signs in to the web dashboard and connects a Discord server (adds the bot, picks a channel for the bot to post in).
2. Users run slash commands in that Discord server: `/report <text> [severity]`, `/status`, `/ping`, `/help`.
3. Discord POSTs the interaction to this app's `/interactions` endpoint. The app verifies Discord's Ed25519 signature, records the interaction, applies any admin-configured rules, replies in Discord, and mirrors a notification to a second channel (Slack or another Discord channel).
4. The dashboard (behind login) shows a live log of every command, its status, latency, and whether it was mirrored — plus a screen to configure each command's behavior per server.

### Stretch goals implemented
- **Configurable command rules in the UI** — toggle a command on/off, toggle mirroring, toggle AI triage, and set a custom reply template (with `{user}`, `{text}`, `{severity}` placeholders) per server.
- **AI triage step** — `/report` runs through Groq (free tier, llama-3.1-8b-instant model) to produce a summary, tags, and a suggested priority, shown in both the Discord reply and the dashboard.
- **Observability** — every interaction is logged with status (`processed`/`failed`/`disabled`), processing time in ms, whether the mirror succeeded, and the raw error message on failure, all visible in the dashboard.
- **Dedup** — Discord interaction IDs are unique-constrained in Postgres; duplicate deliveries are detected and skipped without double-processing.
- **Defer + follow-up** — every command immediately returns a deferred response (within Discord's 3-second window), then does the slower work (AI call, DB write, mirror) asynchronously and edits the response in.

### Not implemented (by choice, given the time box)
- Buttons / modal interactions (MESSAGE_COMPONENT, MODAL_SUBMIT) — the core three interaction types (PING, slash command) are fully handled; buttons/modals would reuse the same signature-verification path but weren't built out.
- Multi-server isolation is partial: commands are configured per-server in the DB, but there's no per-server admin role separation — one admin account manages all connected servers.

---

## Architecture

```
Discord ──POST /interactions──▶ Express ──▶ verify Ed25519 signature
                                          ──▶ dedup on interaction.id (Postgres)
                                          ──▶ respond DEFERRED (within 3s)
                                          ──▶ (async) run command handler
                                                  ├─ optional AI triage (Groq)
                                                  ├─ edit Discord response
                                                  ├─ post to configured channel
                                                  ├─ mirror to Slack/Discord webhook (retried 3x)
                                                  └─ write interaction record to DB

Admin ──▶ React dashboard ──▶ Express session auth ──▶ /api/dashboard/*
                                                          ├─ live interaction log
                                                          ├─ connect server / pick channel
                                                          └─ per-command config (enabled, mirror, AI, custom reply)
```

**Backend:** Node.js + Express. Session-based admin auth (`express-session` backed by Postgres via `connect-pg-simple`, so sessions survive restarts). Rate limiting on `/interactions` and `/auth/login`. `helmet` for security headers.

**Database:** Neon (Postgres). Tables: `servers` (connected guilds + their notification channel), `command_configs` (per-server, per-command settings), `interactions` (the full log, with the Discord interaction ID as primary key for dedup), `session` (express-session store).

**Frontend:** React (Create React App), no UI framework — hand-rolled CSS using a small token system (dark "mission control" theme), polling the dashboard API every 8s for near-live updates.

**Why this stack:** Express + Postgres is the simplest combination that satisfies "must run unattended" — a managed session store and a real ACID database mean no in-memory state to lose on redeploy. Neon and Render both have genuinely free, no-card tiers, satisfying the cost constraint.

---

## Local setup

### Prerequisites
- Node.js 18+
- A free [Neon](https://neon.tech) Postgres database
- A Discord application via the [Developer Portal](https://discord.com/developers/applications)
- A Slack Incoming Webhook URL, or a second Discord channel's webhook URL, for mirroring
- (Optional) A free Groq API key from [Groq Console](https://console.groq.com) — for AI triage on `/report`

### 1. Discord application setup
1. Create an application at the Developer Portal.
2. Under **Bot**, create a bot, copy the **Bot Token**.
3. Under **General Information**, copy the **Application ID** and **Public Key**.
4. Under **Bot → Privileged Gateway Intents**, no special intents are needed (this bot uses interactions, not a gateway connection).
5. Generate an invite URL: OAuth2 → URL Generator → scopes `bot` + `applications.commands`, permissions `Send Messages`, `Embed Links`. Use it to add the bot to a test server.

### 2. Environment variables
```bash
cp .env.example .env
```
Fill in `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DATABASE_URL` (from Neon), `SESSION_SECRET` (any long random string), `ADMIN_USERNAME`/`ADMIN_PASSWORD`, `MIRROR_WEBHOOK_URL`, and optionally `GROQ_API_KEY`.

### 3. Install and set up the database
```bash
npm install
npm run setup:db
```

### 4. Register slash commands
```bash
npm run register:commands
```
Tip: set `DISCORD_TEST_GUILD_ID` in your environment temporarily to register to a single test server — guild-scoped commands update instantly, global ones take up to an hour.

### 5. Run locally
Discord requires a **public HTTPS URL** for the interactions endpoint — `localhost` won't work for real Discord traffic. For local development, tunnel it:
```bash
npx localtunnel --port 3000
# or: ngrok http 3000
```

**Important notes for local tunneling:**
- Keep both terminals open simultaneously — the backend (`npm run dev`) and the tunnel. Closing either drops all in-flight requests silently.
- Every time you restart localtunnel, you get a new URL — update Discord's Interactions Endpoint URL each time.
- localtunnel can be flaky on Windows; ngrok is more stable if you can get it installed.
- Visit the tunnel URL in a browser first to click through any interstitial warning page before testing Discord commands.

Set that tunnel URL + `/interactions` as the **Interactions Endpoint URL** in the Discord Developer Portal (General Information tab). Discord will immediately send a PING to verify it.

Then start the backend:
```bash
# Terminal 1 — backend (watches only src/ to avoid false restarts)
npm run dev
```

Dashboard is available at your tunnel URL (same as the interactions endpoint, just without `/interactions`).

### 6. Build for production locally (optional check)
```bash
npm run build:client
npm start
# everything served from http://localhost:3000, including the dashboard
```

---

## Deployment (Render)

1. Push this repo to GitHub.
2. On [Render](https://render.com), create a **Web Service** from the repo.
3. Build command: `npm install && cd client && npm install && cd .. && npm run build:client`
4. Start command: `npm start`
5. Add all variables from `.env.example` as environment variables in Render's dashboard (use your real values). Set `APP_URL` to the Render URL and `NODE_ENV=production`. Do **not** set `PORT` — Render sets that automatically.
6. Once deployed, run the one-time DB setup and command registration **locally** pointed at the same credentials:
   ```bash
   npm run setup:db
   npm run register:commands
   ```
7. In the Discord Developer Portal, set the **Interactions Endpoint URL** to `https://<your-render-url>/interactions`. Discord will PING it — if it goes green, you're live.
8. (Recommended) Add a free [UptimeRobot](https://uptimerobot.com) monitor pinging `https://<your-render-url>/health` every 5 minutes to prevent Render's free tier from spinning down.

---

## Testing it end-to-end

1. Open the deployed URL, sign in with the admin credentials.
2. Go to **Configure → Connect a server**, paste your test server's Discord guild ID, pick a channel, click Connect.
3. In Discord, run `/report` with some text and a severity level.
4. You should see: an ephemeral reply in Discord (with AI triage if Groq key is set), a message posted to your configured channel, a mirrored notification in Slack/the second Discord channel, and a new row in the dashboard's **Live log** tab within a few seconds.

---

## Security notes
- The bot token, public key, database URL, session secret, and mirror webhook URL are read only from environment variables — never committed, never sent to the client.
- Every `/interactions` request is verified against Discord's Ed25519 signature before any JSON parsing happens; unsigned or forged requests get `401` and are never processed.
- Timestamps older than 5 minutes are rejected to mitigate replay attacks.
- Interaction IDs are the primary key on the `interactions` table, so a duplicate delivery (Discord retries on timeout) is detected via `ON CONFLICT DO NOTHING` and never double-processed.
- Sessions are httpOnly, `secure` in production, and stored server-side in Postgres (not a JWT in localStorage).