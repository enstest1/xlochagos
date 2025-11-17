ypher-Swarm + GOAT-X — Proxies, Cookies, and Hosting (Railway/Fly)

Goal: keep each X account on a stable CA/US IP, minimize Cloudflare friction, avoid re-logins after redeploys, and ship updates safely.

You get:

✅ Per-account static residential/ISP proxy for identity actions (login/post/reply)

✅ Cookie “wristband” persisted on disk so redeploys don’t force logins

✅ Railway deployment (simple) and Fly notes (more network control)

✅ Optional remote JSON for no-redeploy proxy swaps

✅ Optional Proxy Broker micro-service (rotate/pause via API)

✅ Copy-paste code snippets (TypeScript/Node) for GOAT-X + HTTP clients

✅ Sanity checks and troubleshooting

0) What a proxy is (quick ELI5)

A proxy is a middleman server your app uses to reach the internet. When your bot talks to X:

Without a proxy: X sees your host’s IP (Railway/Fly IP).

With a static residential/ISP proxy: X sees a stable “home/ISP-looking” IP (e.g., Rogers/Comcast).
This stability + “human-looking” network reduces challenges/flags. Use one static proxy per account for identity actions. Use direct internet or rotating per-GB only for anonymous ingestion like RSS/news.

1) Architecture (MVP)
[Cypher-Swarm Orchestrator]
   ├── ingest (RSS/news) → direct or rotating residential (per-GB)  ⟵ cheaper, fast
   └── identity (GOAT-X post/like/reply) → static ISP proxy         ⟵ one IP per account

Cookies (wristband)   → /persist (Railway) or /data (Fly)   ⟵ survives restarts
SQLite (caps/dedupe)  → /persist or /data

2) Requirements

GitHub repo (builds with npm run build or pnpm build)

Railway account (Background Service + Volume)

1–4 static residential/ISP proxies (HTTP/S) — one per X account

Cookie JSON files for each account (ct0/auth_token etc.)

3) Railway Setup (recommended first)
3.1 Create the Background Service

New → Service → Deploy from GitHub (select your repo).

Start Command: node dist/index.js (or pnpm start if defined).

Volume: name data, mount path /persist, size 1–3 GB.

Auto-Deploy: ON (rebuilds on each Git push).

3.2 Environment Variables (copy/paste)

Add these in Railway → Variables (adjust paths/handles):

# Core
TZ=America/Vancouver
DB_PATH=/persist/mvp.sqlite
CONTEXT7_DOCS_DIR=/persist/docs
CYPHER_SWARM_OUT=/persist/cypher/out/latest.jsonl
DRY_RUN=false

# Account 1 (Canada example)
ACCT1_HANDLE=@acct_CA
ACCT1_COOKIE_PATH=/persist/secrets/acct1.cookies.json
ACCT1_PROXY_URL=http://USER:PASS@HOST:PORT

# Account 2 (USA example)
ACCT2_HANDLE=@acct_US
ACCT2_COOKIE_PATH=/persist/secrets/acct2.cookies.json
ACCT2_PROXY_URL=http://USER:PASS@HOST:PORT

# Account 3
ACCT3_HANDLE=@acct_alt1
ACCT3_COOKIE_PATH=/persist/secrets/acct3.cookies.json
ACCT3_PROXY_URL=http://USER:PASS@HOST:PORT

# Account 4
ACCT4_HANDLE=@acct_alt2
ACCT4_COOKIE_PATH=/persist/secrets/acct4.cookies.json
ACCT4_PROXY_URL=http://USER:PASS@HOST:PORT

# Optional: remote JSON (no-redeploy proxy swaps)
# PROXY_REMOTE_URL=https://your-private-config/proxies.json


Secret hygiene: keep proxy creds only in Railway envs. Do not commit them to git.

3.3 Upload cookie JSONs (one-time; survive redeploys)

Open Railway → Shell for the service and run:

mkdir -p /persist/secrets /persist/docs /persist/cypher/out

# Paste each cookie JSON (end with Ctrl+D)
cat > /persist/secrets/acct1.cookies.json
# { ... your ct0/auth_token cookie JSON ... }
# Ctrl+D

cat > /persist/secrets/acct2.cookies.json
cat > /persist/secrets/acct3.cookies.json
cat > /persist/secrets/acct4.cookies.json

4) Turn provider lines into proxy URLs (your example)

Provider gave:

91.200.215.32:12323:14a81bdc706ca:e9454f51c2


Meaning:

HOST 91.200.215.32

PORT 12323

USER 14a81bdc706ca

PASS e9454f51c2

Proxy URL (use in env/config):

http://14a81bdc706ca:e9454f51c2@91.200.215.32:12323


One-minute test (anywhere):

curl -x http://14a81bdc706ca:e9454f51c2@91.200.215.32:12323 https://api.ipify.org?format=json


You should see the proxy IP in the JSON. If provider says “activating”, wait a few minutes and retry.

Node/undici single test:

import { ProxyAgent, request } from "undici";
const proxy = new ProxyAgent("http://14a81bdc706ca:e9454f51c2@91.200.215.32:12323");
const { body } = await request("https://api.ipify.org?format=json", { dispatcher: proxy });
console.log(await body.json());


If you posted that credential publicly, rotate it in your provider dashboard.

5) Wire per-account proxies in code (TypeScript/Node)
5.1 Accounts loader — src/config/accounts.ts
export type AccountCfg = {
  handle: string;
  cookiePath: string;
  proxyUrl?: string;
};

function account(n: number): AccountCfg | null {
  const handle = process.env[`ACCT${n}_HANDLE`];
  if (!handle) return null;
  return {
    handle,
    cookiePath: process.env[`ACCT${n}_COOKIE_PATH`]!,
    proxyUrl: process.env[`ACCT${n}_PROXY_URL`],
  };
}

export const ACCOUNTS: AccountCfg[] =
  [1,2,3,4].map(account).filter(Boolean) as AccountCfg[];

5.2 GOAT-X via CLI (respect HTTP(S)_PROXY) — src/publish/goatx-cli.ts
import { spawn } from "node:child_process";
import type { AccountCfg } from "../config/accounts";

export async function goatxPost(text: string, acct: AccountCfg) {
  const env = { ...process.env };
  if (acct.proxyUrl) {
    env.HTTP_PROXY  = acct.proxyUrl;
    env.HTTPS_PROXY = acct.proxyUrl;
  }
  const args = ["post", "--cookie", acct.cookiePath, "--text", text];

  return new Promise<string>((resolve, reject) => {
    const p = spawn("goatx", args, { env });
    let out = "", err = "";
    p.stdout.on("data", d => out += d);
    p.stderr.on("data", d => err += d);
    p.on("close", (code) => code === 0 ? resolve(out) : reject(new Error(err || `goatx exit ${code}`)));
  });
}

5.3 HTTP clients through the right IP

Axios — src/net/http.ts

import axios from "axios";
import HttpsProxyAgent from "https-proxy-agent";
import type { AccountCfg } from "../config/accounts";

export function axiosFor(acct: AccountCfg) {
  if (!acct.proxyUrl) return axios.create();
  const agent = new HttpsProxyAgent(acct.proxyUrl);
  return axios.create({ httpAgent: agent, httpsAgent: agent });
}


undici — src/net/undici.ts

import { ProxyAgent, request } from "undici";
import type { AccountCfg } from "../config/accounts";

export async function getIp(acct: AccountCfg) {
  const dispatcher = acct.proxyUrl ? new ProxyAgent(acct.proxyUrl) : undefined;
  const { body } = await request("https://api.ipify.org?format=json", { dispatcher });
  return body.json();
}

5.4 Outbound IP health (dashboard/logs)

src/health/outbound.ts

import { axiosFor } from "../net/http";
import type { AccountCfg } from "../config/accounts";

export async function logOutboundIp(acct: AccountCfg) {
  try {
    const http = axiosFor(acct);
    const r = await http.get("https://api.ipify.org?format=json", { timeout: 8000 });
    console.log(`[ip] ${acct.handle} → ${r.data.ip}`);
  } catch (e: any) {
    console.warn(`[ip] ${acct.handle} failed: ${e.message}`);
  }
}


Boot + hourly (e.g., in src/index.ts)

import { ACCOUNTS } from "./config/accounts";
import { logOutboundIp } from "./health/outbound";
// import { goatxPost } from "./publish/goatx-cli";

(async () => {
  for (const a of ACCOUNTS) await logOutboundIp(a);
  setInterval(() => ACCOUNTS.forEach(logOutboundIp), 60*60*1000);

  // Example post:
  // await goatxPost("Hello from proxy https://x.com", ACCOUNTS[0]);
})();

6) No-redeploy proxy swaps (optional remote JSON)

Enable by setting PROXY_REMOTE_URL env and polling a private JSON.

Shape (https://your-private-config/proxies.json):

{
  "@acct_CA": { "proxy_url": "http://USER:PASS@ca-static.newhost:PORT" },
  "@acct_US": { "proxy_url": "http://USER:PASS@us-static.samehost:PORT" }
}


Poller — src/config/remote.ts

import { ACCOUNTS } from "./accounts";
import axios from "axios";

const REMOTE_URL = process.env.PROXY_REMOTE_URL;

export async function refreshProxiesFromRemote() {
  if (!REMOTE_URL) return;
  try {
    const { data } = await axios.get<Record<string, {proxy_url?: string}>>(REMOTE_URL, { timeout: 5000 });
    for (const acct of ACCOUNTS) {
      const entry = data[acct.handle];
      if (entry?.proxy_url && entry.proxy_url !== acct.proxyUrl) {
        console.log(`[proxy] ${acct.handle} -> ${entry.proxy_url}`);
        acct.proxyUrl = entry.proxy_url;
      }
    }
  } catch (e: any) {
    console.warn(`[proxy] remote fetch failed: ${e.message}`);
  }
}


Call it periodically:

import { refreshProxiesFromRemote } from "./config/remote";
setInterval(refreshProxiesFromRemote, 3 * 60 * 1000); // every 3 min

7) Fly.io (if/when you want more network control)

Volume:

fly volumes create data --size 3 --region sea


fly.toml essentials:

app = "cypher-swarm"
primary_region = "sea"

[env]
DB_PATH="/data/mvp.sqlite"
CONTEXT7_DOCS_DIR="/data/docs"
CYPHER_SWARM_OUT="/data/cypher/out/latest.jsonl"
DRY_RUN="false"
TZ="America/Vancouver"

[[mounts]]
source="data"
destination="/data"

[processes]
worker = "node dist/index.js"


Cookies via fly ssh sftp → /data/secrets/....
Fly can allocate static egress IPs per Machine, but for Cloudflare-sensitive identity, static residential/ISP proxies remain safer.

8) Bot-protection hygiene (do this)

One static IP per account (don’t hop).

Stable headers (User-Agent, Accept-Language) + timezone matching the proxy’s geo.

Reuse cookies; refresh only on 401/403.

Exponential backoff on 403/429; mark proxy “cooldown”.

Posting hours aligned to geo; warm up with likes/replies.

Content variation across accounts (Cypher-Swarm heuristics/voices).

9) Troubleshooting

Re-logging after deploys → cookie files must be under /persist (Railway) or /data (Fly). Verify paths and that files exist post-restart.

Proxy not applied → log outbound IP per account; if you see a DC ASN or your host IP, your proxy env/agent isn’t attached (set both HTTP_PROXY and HTTPS_PROXY for CLI).

Frequent CF blocks → ensure proxy is residential/ISP (not datacenter), slow pace, align headers/TZ, consider swapping to another static resi/ISP IP.

10) Optional: tiny Proxy Broker (only when you outgrow 1–4 accounts)

What it gives: centralized rotate/pause buttons and health across multiple deployments.

API (interface-first):

GET  /v1/proxies/{account_id}         → { account_id, proxy_url, ip_cached, status }
POST /v1/proxies/{account_id}/rotate  → { proxy_url, ip_cached }
POST /v1/proxies/{account_id}/blacklist { ip } → { ok: true }
POST /v1/health/report { account_id, ip, rtt_ms, err_code?, cf_detected? } → { ok: true }


Use bearer token auth + (ideally) IP allowlist. Backed by SQLite/PG on Railway.
For 1–4 accounts: simpler and cheaper to use envs or the remote JSON method above.

11) Copy-ready checklists
Railway (once)

Create service from GitHub

Add Volume /persist

Set env vars (core + per-account)

Upload cookie JSONs to /persist/secrets/...

Auto-Deploy ON

Code (once)

Accounts env loader

goatxPost() with per-account proxy env

HTTP clients with per-account ProxyAgent

IP health logger

(Optional) remote JSON poller

Daily ops

Adjust caps/heuristics in UI

Watch Health panel (IP, error rate, CF alarms)

Swap proxy by editing envs + restart or edit remote JSON (no restart)

12) Quick manual tests

GOAT-X one-off via proxy (Railway Shell):

HTTP_PROXY=$ACCT1_PROXY_URL \
HTTPS_PROXY=$ACCT1_PROXY_URL \
goatx post --cookie $ACCT1_COOKIE_PATH --text "hello from proxy"


Outbound IP check (boot or hourly):

curl -x "$ACCT1_PROXY_URL" https://api.ipify.org?format=json

Appendix A — Choosing provider options

Type: Static Residential/ISP (not datacenter)

Rotation: Off (sticky; same IP)

Geo: Match account’s timezone

Bandwidth: Unlimited/static plans are fine (identity is low-bandwidth)

“IP quality” add-on: nice-to-have if available; not mandatory.
If unavailable, a standard static residential/ISP IP works—just warm up and keep identity stable.

That’s it. Once the envs are in Railway and cookies live under /persist, you can push code freely—Railway redeploys, your cookies persist, and GOAT-X posts route through the right per-account proxy automatically.