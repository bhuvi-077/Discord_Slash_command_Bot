# AI_NOTES.md

## Tools and models used
Claude (Anthropic) via Claude.ai — used throughout the entire project from initial scaffolding
to debugging and deployment. The split was roughly 70/30: Claude generated the initial code
structure, middleware, database schema, React dashboard, and documentation, while I drove
the actual setup, configuration, debugging of environment-specific issues, and all the
real-world integration work (Discord Developer Portal, Neon, Render, Groq, localtunnel/ngrok).

---

## Key decisions I made and why

**1. Chose Groq over Gemini for AI triage.**
The brief allowed either. I went with Groq because the API is OpenAI-compatible (simpler
request/response format), has a very generous free tier, and response times are noticeably
faster than Gemini for short classification tasks like triage. The code was updated to
auto-detect whichever key is present (GROQ_API_KEY takes priority over GEMINI_API_KEY),
so either provider works without any other changes.

**2. Used localtunnel first, then switched to Render for production.**
For local testing, localtunnel was the quickest path to a public HTTPS URL. It turned out
to be unreliable (it disconnected multiple times during testing — see bugs section below),
but it served its purpose for verifying the core flow before deploying. Switching to Render
for production eliminated all tunnel-related instability permanently.

**3. Used UptimeRobot to keep Render's free tier alive.**
Render's free tier spins down after 15 minutes of inactivity, which would cause Discord to
time out on the first command after idle (since even the deferred response needs the server
up within ~3 seconds). Rather than pay for a higher tier or switch platforms, I added a free
UptimeRobot monitor pinging the /health endpoint every 5 minutes — simple, free, effective.

---

## The bugs I actually hit and how I fixed them

### Bug 1: `.env` file named `.env.example` — DB wouldn't connect
**What happened:** After setting up Neon and running `npm run setup:db`, got a connection
error: "The server does not support SSL connections." Spent time thinking it was a Neon
configuration issue or an SSL setting problem in the code.

**What was actually wrong:** The `.env` file was named `.env.example` — I forgot to rename
it after copying from the template. So `dotenv` never loaded any environment variables, and
`DATABASE_URL` was the literal placeholder string `postgresql://user:password@host/dbname`,
which pointed nowhere real, let alone a Neon server that supports SSL.

**How I fixed it:** Renamed the file from `.env.example` to `.env`. Setup ran immediately
after that. Simple mistake, not obvious to spot because the error message pointed at SSL,
not at a missing/misconfigured env file.

---

### Bug 2: Neon free tier cold-start causing DB connection timeouts
**What happened:** After `/ping` worked, the terminal showed:
```
[DB] Query error: Connection terminated due to connection timeout
[Dedup] Error: Connection terminated due to connection timeout
```
The dedup INSERT was failing on every first command after the DB had been idle.

**What was actually wrong:** The DB connection pool had `connectionTimeoutMillis: 2000`
(2 seconds), but Neon's free tier "suspends" inactive databases and takes several seconds
to wake up on the first query. 2 seconds wasn't enough headroom for that cold start.

**How I fixed it:** Changed `connectionTimeoutMillis` from `2000` to `10000` in
`src/db/index.js`. After that, the first query after idle succeeded (just slightly slower),
and all subsequent queries in the same session were fast since the pool kept the connection
warm.

---

### Bug 3: localtunnel disconnecting silently — causing "application didn't respond in time"
**What happened:** This was the most confusing bug because the symptom looked like a Discord
or bot issue, not a tunnel issue. Commands would work once, then start timing out randomly.
Sometimes `/ping` would work fine and then the next `/report` would fail, or everything
would fail after I stepped away for a few minutes.

**What was actually wrong:** localtunnel silently disconnects after periods of inactivity or
instability. When the tunnel is dead, Discord sends the interaction to a URL that no longer
forwards to anything — so your server never even sees the request, logs nothing, and Discord
times out. The mistake I was making was restarting the tunnel (getting a new URL) and
updating Discord's Interactions Endpoint URL correctly, but sometimes the tunnel would die
again mid-session without me noticing.

**How I fixed it:** Two things:
1. Switched to ngrok for more reliable tunneling (though on Windows, ngrok had its own
   permission/installation issues — "Access is denied" when running the auth command).
2. Eventually just restarted localtunnel carefully and kept that terminal open and untouched
   for the whole session. The key insight: if `/health` responds but `/interactions` times
   out, it's the tunnel or a routing issue — not the bot logic.
3. For production: deployed to Render, which eliminated the tunnel entirely.

---

### Bug 4: nodemon restarting repeatedly — silently dropping live requests
**What happened:** Commands were timing out even when both the tunnel and server appeared
to be running. Running curl against the `/interactions` endpoint returned nothing — no
response, no error, just silence. The terminal showed `[nodemon] restarting due to changes`
repeatedly, even when I wasn't editing any files.

**What was actually wrong:** nodemon's default watch pattern (`*.*`) was watching the
entire project directory, including `client/build/`, `node_modules/`, and possibly files
being touched by VS Code's auto-save, Windows Defender scanning, or other background
processes modifying file metadata. Every time any file anywhere in the project was touched,
nodemon restarted the server — which briefly took it offline, causing any in-flight request
(including Discord's interaction POST) to get silently dropped with no response and no log.
This was especially hard to spot because nodemon restarts are fast, and the window where
the server is down is only a second or two — just long enough to drop a Discord request
but short enough to look like the server was always running.

**How I fixed it:** Added `--watch src --ext js,json` to the nodemon dev script in
`package.json`, so nodemon only watches the `src/` folder for actual code changes:
```json
"dev": "nodemon --watch src --ext js,json src/index.js"
```
After this fix, the terminal showed `[nodemon] watching path(s): src\**\*` instead of
`*.*`, and the server stayed stable between tests. Commands started working consistently
immediately after.

This was the trickiest bug of the whole project — the symptom (Discord timeout) looked
identical to the tunnel-disconnection bug, but the root cause was completely different.
The diagnostic that cracked it was noticing `[nodemon] restarting due to changes` in the
logs right at the moment of a failed request, without having edited any files.

---

### Bug 5: Render build failing — `react-scripts: not found`
**What happened:** First Render deploy failed with:
```
sh: 1: react-scripts: not found
==> Build failed
```

**What was actually wrong:** The build command `npm install && npm run build:client` only
installed root dependencies (in `discord-bot/node_modules/`), but `npm run build:client`
runs `cd client && npm run build` which needs `react-scripts` installed inside
`client/node_modules/` — a completely separate `npm install` that wasn't being run.

**How I fixed it:** Updated the Render build command to:
```
npm install && cd client && npm install && cd .. && npm run build:client
```
This explicitly installs client dependencies before running the React build. Second deploy
succeeded immediately.

---

### Bug 6: Windows curl SSL error when testing the tunnel
**What happened:** Running curl against the localtunnel URL returned:
```
curl: (35) schannel: next InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK
```

**What was actually wrong:** Windows' built-in TLS library (schannel) was trying to verify
the certificate revocation list for localtunnel's SSL certificate and couldn't reach the
OCSP server — a Windows networking/security configuration issue, not an actual problem with
the tunnel or server.

**How I fixed it:** Used `curl -k` to skip certificate verification for diagnostic purposes.
The tunnel and server were actually fine — the error was purely curl-on-Windows being strict
about certificate revocation checks. Opening the same URL in a browser worked immediately
since browsers handle this more gracefully.

---

## What I'd improve or add with more time

- **Button and modal interactions** — the two remaining Discord interaction types from the
  stretch goals. The signature verification and dedup infrastructure already handles them;
  it's mostly new handler logic needed.
- **Automated tests** — all testing during this build was manual (running commands in
  Discord, checking logs). A proper test suite for the signature verification middleware
  and command handlers would make future changes much safer.
- **Better tunnel solution for local dev** — localtunnel was too unreliable on Windows.
  If I were starting again I'd either get ngrok working properly from the start (resolving
  the Windows permission issue by running as administrator), or skip local tunneling
  entirely and deploy to Render earlier in the process using Render's auto-deploy from
  GitHub on every push.
- **Structured logging** — replacing `console.log`/`console.error` with a proper JSON
  logging library (like pino) would make Render's log output queryable and easier to search
  for specific interaction IDs or error types.
- **Per-server admin accounts** — the current setup has one shared admin login for all
  connected servers. For real multi-server support, each server owner should have their own
  login, scoped to only their server's data and config.