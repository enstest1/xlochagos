Playwright MCP for Cypher-Swarm + GOAT-X

(one-copy .md you can drop in your repo)

Why this path: Microsoft’s Playwright MCP keeps your “browse/collect” side inside the Model Context Protocol ecosystem you’re already moving toward (Claude + MCP tools). It’s actively maintained, scriptable, and plays nicely with your per-account static proxies and cookie wristbands. You’ll keep GOAT-X for publishing; Playwright MCP handles reading, thread context, and grounding.

0) What you’ll get

Agent-ready browser: Navigate/Extract via Playwright MCP (headless Chromium).

Per-account identity: Proxy + Cookies loaded per session, matching the IP/country you post from.

Clean integration: A tiny HTTP bridge that forwards navigate / click / type / extract / close to the MCP server (so your Node app doesn’t need a JSON-RPC MCP client yet).

Railway deploy: Run 24/7 with /persist volume for cookies, env-based proxy mapping, and auto-redeploy on push.

Cookie hygiene: (Optional) headless login worker to refresh cookies when they go stale.

1) Architecture (at a glance)
[Cypher-Swarm Orchestrator (Node)]
   ├─ Sources (RSS, follows, topics)
   ├─ Browser client -> [HTTP Bridge] -> [Playwright MCP server]
   │     per-account: proxy + cookiePath
   ├─ Composer (variants, tone, heuristics)
   └─ Publisher (GOAT-X)  -> per-account proxy + cookies
       (static residential/ISP IP)


Identity actions (login/post/like/reply) → GOAT-X behind static ISP/residential proxy per account.

Reading/grounding (open threads, extract text) → Playwright MCP using the same proxy and cookies per account for consistency.

2) Prereqs

GitHub repo with your Cypher-Swarm code (TypeScript/Node).

Railway account (Background Service + Volume).

1–4 static residential/ISP proxies (HTTP/S), one per account.

Cookie JSON files per account (exported by your login worker or manually once).

Packages you’ll use

Playwright MCP server (server side)

(Optional) @playwright/test or playwright runtime if needed

Express (for the small HTTP bridge)

Axios (your app already uses it)

You don’t need random “cookie grabber” repos; stick to Playwright for login + cookie export and Playwright MCP for browsing.

3) Environment (Railway)

Create one Service for the orchestrator. Add a Volume at /persist (1–3 GB).

Set env vars (example 4 accounts):

# Core
TZ=America/Vancouver
DB_PATH=/persist/mvp.sqlite
CONTEXT7_DOCS_DIR=/persist/docs
CYPHER_SWARM_OUT=/persist/cypher/out/latest.jsonl
DRY_RUN=false

# Browser backend choice + MCP bridge endpoint
BROWSER_BACKEND=mcp
MCP_HTTP_BASE=http://localhost:4500            # where your HTTP bridge listens
MCP_BRIDGE_TOKEN=change_me

# Account 1 (Canada)
ACCT1_HANDLE=@acct_CA
ACCT1_COOKIE_PATH=/persist/secrets/acct1.cookies.json
ACCT1_PROXY_URL=http://USER:PASS@ca-static.yourproxy:PORT

# Account 2 (USA)
ACCT2_HANDLE=@acct_US
ACCT2_COOKIE_PATH=/persist/secrets/acct2.cookies.json
ACCT2_PROXY_URL=http://USER:PASS@us-static.yourproxy:PORT

# Account 3
ACCT3_HANDLE=@acct_alt1
ACCT3_COOKIE_PATH=/persist/secrets/acct3.cookies.json
ACCT3_PROXY_URL=http://USER:PASS@us-static.yourproxy:PORT

# Account 4
ACCT4_HANDLE=@acct_alt2
ACCT4_COOKIE_PATH=/persist/secrets/acct4.cookies.json
ACCT4_PROXY_URL=http://USER:PASS@ca-static.yourproxy:PORT

# (Optional) Remote JSON for no-redeploy proxy swaps
# PROXY_REMOTE_URL=https://your-private-config/proxies.json


Upload cookie files once (Railway → Shell):

mkdir -p /persist/secrets /persist/docs /persist/cypher/out
# paste cookie JSON for each account, end with Ctrl+D
cat > /persist/secrets/acct1.cookies.json
# { ...auth_token, ct0, etc... }
# Ctrl+D

cat > /persist/secrets/acct2.cookies.json
cat > /persist/secrets/acct3.cookies.json
cat > /persist/secrets/acct4.cookies.json


Cookies live on the volume → survive redeploys → no re-login on each build.

4) Playwright MCP — what it is & how we’ll run it

Playwright MCP is a server that exposes browser automation as MCP tools. Your agent (or our bridge) calls tools like navigate, evaluate, screenshot, etc.

We’ll run two pieces in the same Railway service:

MCP server process (Playwright MCP).

Tiny HTTP bridge that exposes REST endpoints:

POST /mcp/browser/navigate → calls MCP tool navigate

POST /mcp/browser/click → click

POST /mcp/browser/type → type

POST /mcp/browser/extract → extract (article text, HTML, or screenshot)

POST /mcp/browser/close → end session

Why a bridge? It keeps your Node app simple (HTTP calls) while you still get MCP’s benefits. Later you can talk to MCP directly.

5) Session identity (per account)

Each browse session should match the publishing identity:

Proxy: use the same static ISP/resi proxy as GOAT-X for that account.

Cookies: load that account’s /persist/secrets/*.cookies.json into the browser context.

Locale/Timezone: align to IP’s country when possible (e.g., en-US + America/Toronto for CA).

This reduces mismatches and Cloudflare friction.

6) Implementation outline (copy this flow)
6.1 Start the MCP server

Add a script that launches the Playwright MCP server. (Exact command depends on the server package you adopt; typically it spins up a JSON-RPC handler with a Playwright driver.)

Ensure it accepts tool calls for navigate, click, type, extract, plus a way to create context with proxy + cookies. If the server doesn’t load cookies natively, add a custom MCP tool “loadCookies(ctx)” to inject them.

If your chosen MCP server doesn’t ship a cookie-loader, write a small MCP plugin that:

Creates a browser context with proxy options.

Reads cookie JSON from ctx.cookiePath, then context.addCookies().

Emits a session id keyed by accountHandle so subsequent actions reuse it.

6.2 Build the tiny HTTP bridge

Express server with routes: /mcp/browser/{action}.

Each route:

Validates Authorization: Bearer ${MCP_BRIDGE_TOKEN}.

Forwards {ctx, opts} to the MCP server’s tool call (JSON-RPC).

Returns the result or an error.

Shape (pseudocode):

POST /mcp/browser/navigate  -> tools.call("navigate",  { ctx, opts })
POST /mcp/browser/click     -> tools.call("click",     { ctx, opts })
POST /mcp/browser/type      -> tools.call("type",      { ctx, opts })
POST /mcp/browser/extract   -> tools.call("extract",   { ctx, opts })
POST /mcp/browser/close     -> tools.call("close",     { ctx })

6.3 Use it from Cypher-Swarm

In your Node app, centralize a BrowserTool client that hits the bridge:

navigate({accountHandle, proxyUrl, cookiePath}, {url})

extract(..., {readability:true, screenshot:true})

The client always sends the per-account proxyUrl + cookiePath. The bridge/MCP server ensures those become the session identity.

6.4 Grounding path

For each target tweet/thread URL from Stream/Targets:

navigate(...) to the URL.

extract(...) to get title + readable text + screenshot.

Pipe the text to your Composer (tone/variants/heuristics).

You approve → GOAT-X publishes (same proxy + cookies).

Store the citation URL and any extracted snippet in your UI’s Grounding panel.

7) Railway process model

One service, two processes (both start via node dist/server.js or a Procfile-like launcher):

Process A: start Playwright MCP server (child process or module import).

Process B: start the HTTP bridge (Express on, say, :4500).

Your orchestrator (same service) simply calls the bridge over localhost.

Persistent files (cookies/DB) live under /persist, mounted as a Volume.

8) Cookie hygiene (optional but recommended)

Keep your login worker (Playwright) to log in through the proxy and export cookies to /persist/secrets/@handle.cookies.json.

Add a daily cookie health check (dry GOAT-X verify, or open /home using cookies) → on 401/403, re-login and overwrite cookie file.

Add a UI row that prints auth_token/ct0 presence and expiry (you already have a viewer snippet).

9) Health & safety (Cloudflare & pacing)

Stable IP per account (don’t hop).

Stable UA/locale/timezone per account; match the proxy’s country.

Warm-up pace, human-like delays.

Exponential backoff on 403/429; cooldown the proxy.

Never auto-post from browser actions; all posting goes via GOAT-X.

Respect ToS/law; use only on accounts you control.

10) Step-by-step: standing it up

Wire envs on Railway (Section 3).

Upload cookies to /persist/secrets/... (or run your login worker once per account).

Add MCP server to your codebase (as a module or child process):

Ensure it can create context with a given proxy.

Ensure it can load cookies from a given file path.

Expose MCP tools for navigate / click / type / extract / close.

Add HTTP bridge (small Express app) that calls those tools.

Switch your BrowserTool client to use BROWSER_BACKEND=mcp and point MCP_HTTP_BASE to the bridge (e.g., http://localhost:4500).

Test from your worker:

Call navigate({acct_CA, cookiePath, proxyUrl}, {url: tweetURL}).

Call extract(..., {readability:true, screenshot:true}).

Confirm IP health in logs (use /ipify probe through the bridge if helpful).

Push to GitHub → Railway auto-deploys; cookies persist → no re-login.

11) Troubleshooting

Still getting CF challenges?
Verify the proxy is residential/ISP, not DC. Align UA/locale/TZ. Reduce pace. Keep sessions warm, reuse cookies.

Bridge returns errors?
Check the MCP server logs — tool name mismatch or missing session init are common. Ensure the first call loads cookies and sets the proxy before action.

Cookies “don’t stick”?
Confirm your MCP tool calls context.addCookies() (or uses a persistent context) before goto. Ensure the cookie file has auth_token and ct0.

Wrong IP in browser?
Add a one-liner action to fetch('https://api.ipify.org?format=json') via evaluate and log it. If it shows a DC IP, your proxy isn’t attached at the browser context.

12) Minimal contracts (to keep your code consistent)

Request payload shape (what your app sends to the bridge):

{
  "ctx": {
    "accountHandle": "@acct_CA",
    "proxyUrl": "http://USER:PASS@ca-static.proxy:PORT",
    "cookiePath": "/persist/secrets/acct1.cookies.json",
    "timeoutMs": 30000
  },
  "opts": {
    "url": "https://x.com/wallchain_xyz/status/...",
    "waitFor": "networkidle"
  }
}


Extract response (what you want back):

{
  "url": "https://x.com/wallchain_xyz/status/...",
  "title": "…",
  "text": "…(readability/plain)…",
  "html": null,
  "screenshotB64": "iVBORw0KGgoAAA…",
  "meta": { "accountHandle": "@acct_CA" }
}


(If your MCP server’s tool names differ, keep this contract stable in the bridge; translate under the hood.)

13) Railway specifics (quick checklist)

Service: from GitHub → Start command starts both MCP server and bridge (e.g., a small launcher script).

Volume: /persist (cookies + SQLite).

Env vars: core + per-account + bridge token.

Shell: upload cookies or run login worker.

Auto-deploy: ON.

Launcher tip: If you prefer separate processes, use concurrently:

concurrently \
  "node dist/mcp/server.js" \
  "node dist/mcp/bridge.js" \
  "node dist/index.js"


(or start MCP + bridge inside your main index.js if you prefer a single process)

14) When you’re ready for more

Direct MCP client: drop the bridge and call MCP JSON-RPC directly from your Node app.

Markdown extraction: add a “vision/extractor” MCP (e.g., puppeteer-vision-mcp) to produce tidy markdown for long pages.

Config without redeploy: enable PROXY_REMOTE_URL polling to update proxies without restarts.

15) TL;DR (copy to your README)

Use Playwright MCP for browsing (navigate/extract) with per-account proxy + cookies.

Keep GOAT-X for posting; same proxies/cookies.

Run both in Railway with /persist volume → no re-logins on deploy.

Add cookie health checks + headless login worker.

Start simple with the HTTP bridge; move to direct MCP later if you want.

You’ll have a clean, agent-aware, future-proof browsing layer that slots into your existing Cypher-Swarm pipeline and keeps you out of Cloudflare jail.