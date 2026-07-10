---
name: local-mcp-access
description: Call the local EmDash dev server's MCP endpoint (/_emdash/api/mcp) from within the same environment (e.g. an AI agent running alongside `pnpm dev`), without a browser. Use this when you need to hit the MCP JSON-RPC API programmatically against a localhost EmDash instance — dev-bypass session auth does NOT work on MCP, only a Bearer token does. Also use this when the project's `emdash-site-local` MCP connector (registered in `.mcp.json`) is missing, unauthenticated, or returning 401s — it needs a fresh `EMDASH_LOCAL_PAT` env var, which this skill mints.
---

# Local MCP Access (no browser)

`/_emdash/api/mcp` is **bearer-only by design** (confirmed by reading
`packages/core/src/astro/middleware/auth.ts` in the emdash source: the
middleware explicitly refuses to consult session/cookie auth for the MCP
endpoint and returns `401 NOT_AUTHENTICATED` even with a valid admin
session cookie). So a browser login or the dev-bypass session alone is
**not enough** — you need a Personal Access Token (PAT, `ec_pat_*`).

The EmDash docs' "session cookies also work for MCP" claim does not hold
for this middleware version — don't rely on it.

The good news: on `localhost`/`127.0.0.1` with no auth provider configured,
you can mint that PAT yourself with plain HTTP calls — no browser, no
human-in-the-loop OAuth approval.

## If this project registers a local connector in `.mcp.json`

Check `.mcp.json` at the repo root for an entry pointing at
`http://127.0.0.1:4321` (or similar loopback URL) — by convention named
with a `-local` suffix, e.g.:

```json
"emdash-site-local": {
  "type": "http",
  "url": "http://127.0.0.1:4321/_emdash/api/mcp",
  "headers": { "Authorization": "Bearer ${EMDASH_LOCAL_PAT}" }
}
```

`${EMDASH_LOCAL_PAT}` is Claude Code's env var expansion syntax — the raw
token is never written to this file (it's committed to git). When the
variable is set and valid, the MCP tools show up natively
(`mcp__<entry-name>__*`) — no curl needed, skip straight to using them.

If no such entry exists in this project's `.mcp.json` yet, there's nothing
to reconnect — just use the manual curl steps below directly.

Any **other** entry in the same file without a `-local` suffix (e.g.
`emdash-site`) is a deployed/production URL, not this loopback dev server —
see "Do NOT use this against production" below before touching it.

**If the local connector is missing, unauthenticated, or a call 401s**: the
env var isn't set yet, or the PAT it points to went stale (e.g. `.wrangler/`
got wiped — see Notes below). Fix it:

1. Run Steps 1-2 below to mint a fresh PAT.
2. `export EMDASH_LOCAL_PAT=ec_pat_...` in the shell Claude Code is running
   in (or wherever the process reads its environment from).
3. Reconnect the MCP server (e.g. `/mcp` to reconnect, or restart the
   session) so the new env var is picked up — `.mcp.json` expansion happens
   when the connector is established, not on every call.

If reconnecting isn't possible in the current context, fall back to Step 3
below (raw curl with the token in the `Authorization` header) — it works
regardless of how the connector is registered.

## Prerequisites

- The EmDash dev server is running (e.g. `pnpm dev` in
  `templates/sample-emdash-site`, default `http://127.0.0.1:4321`).
- You're calling from the same machine/sandbox the dev server is on
  (`localhost` only — this whole flow is a dev-only bypass and refuses to
  work against any non-local instance).

## Do NOT use this against production

This entire flow only works against the **unbuilt Astro dev server**
(`pnpm dev` / `astro dev`). Confirmed by reading
`packages/core/src/astro/routes/api/setup/dev-bypass.ts`: the very first
check in the handler is

```ts
if (!import.meta.env.DEV) {
  return apiError("FORBIDDEN", "Dev bypass is only available in development mode", 403);
}
```

`import.meta.env.DEV` is `false` in any built/deployed instance (Cloudflare
Workers, Pages, etc.) — not just "usually false on non-localhost hosts", but
compiled out entirely. So `/_emdash/api/setup/dev-bypass` **always** returns
`403 FORBIDDEN` in production, no matter the host or network path. There is
no equivalent bypass there — this skill has nothing to offer for a
production MCP connector.

The `emdash-site` entry in `.mcp.json` (the deployed URL, as opposed to
`emdash-site-local`) needs a PAT minted the normal way instead: log in to
the real production admin panel (passkey/OAuth/whatever the site's
`authProviders` are) and create a token at `/_emdash/admin/settings/api-tokens`,
or run `emdash login --url https://<production-url>` (real OAuth Device
Flow — a human has to approve it in a browser, unlike the localhost case
where `emdash login` silently uses dev-bypass instead). Don't try to reuse
this skill's steps against a production URL; they're a dead end there by
design.

## Steps

### 1. Get a dev-bypass session cookie

```bash
curl -s -c /tmp/emdash-cookies.txt \
  "http://127.0.0.1:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin"
```

This only works when the site has no real auth provider configured and the
request host is a loopback address — it grants an Admin-role session
(`dev@emdash.local`, role 50) with zero interaction. This is also what
`emdash login` does automatically against `localhost`.

### 2. Mint a PAT via the REST API using that session

```bash
curl -s -b /tmp/emdash-cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-EmDash-Request: 1" \
  -X POST http://127.0.0.1:4321/_emdash/api/admin/api-tokens \
  -d '{"name": "agent-local", "scopes": ["admin"]}'
```

- `X-EmDash-Request: 1` is required on state-changing session-authenticated
  API calls (a lightweight CSRF guard — browsers can't set custom headers
  cross-origin, so a plain `curl` sending it is fine).
- The endpoint requires the session user to be Admin (role ≥ 50) — the
  dev-bypass session already qualifies.
- Since this never leaves localhost, requesting the `admin` scope (full
  access) instead of granular scopes is fine — no need to enumerate
  `content:read`/`content:write`/etc.
- The response's `data.token` (`ec_pat_...`) is shown **once** — capture it.
- The admin UI equivalent is `http://127.0.0.1:4321/_emdash/admin/settings/api-tokens`,
  if a human wants to do this by hand instead.

### 3. Call MCP with that token

```bash
curl -s \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ec_pat_..." \
  -X POST http://127.0.0.1:4321/_emdash/api/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Swap `method`/`params` for any MCP JSON-RPC call, e.g.
`{"method":"tools/call","params":{"name":"content_list","arguments":{"collection":"posts","limit":1}}}`.

## Notes

- No tunnel, no external connector, no cross-boundary networking needed —
  this is purely loopback HTTP from the same environment the dev server is
  running in.
- The minted PAT is long-lived; nothing here auto-revokes it. Revoke via
  `DELETE /_emdash/api/admin/api-tokens/:id` (needs the token's `id` from
  the create response, or list first with `GET` on the same session) if you
  want to clean up — optional for throwaway local sandboxes.
- Full MCP tool reference: `docs.emdashcms.com/reference/mcp-server` (scopes
  table, all 45 tools). Ignore its "session cookies also work" line for the
  reason above.
- If the dev server's local state gets wiped (e.g. deleting `.wrangler/`,
  which holds the local D1/SQLite data), any previously minted PAT stops
  working (`401 INVALID_TOKEN` — the token row is gone, not just the
  session). Just redo steps 1-2 to mint a fresh one; nothing else changes.

## Reading plugin settings (not exposed via MCP)

The core MCP server's 45 tools (`content_*`, `schema_*`, `settings_*`,
`media_*`, `menu_*`, `taxonomy_*`, `revision_*`, `search`) are fixed and
hardcoded in emdash core — there is no tool for reading a specific plugin's
own settings (e.g. a Notion-sync plugin's connection config). To read those,
call the plugin's Block Kit admin route directly with the same Bearer PAT
from step 2 above:

```bash
curl -s \
  -H "Authorization: Bearer ec_pat_..." \
  http://127.0.0.1:4321/_emdash/api/plugins/<plugin-id>/admin
```

This returns the admin page's current Block Kit JSON (field values reflect
saved config; `secret_input` fields never return their actual value — only
non-secret state like locale, dropdown selections, and computed status
text). The URL path is always `/admin` regardless of what path the plugin's
manifest declares under `admin.pages[].path` (that path is only used for
the sidebar link in the web UI).

Note this route normally requires an `X-EmDash-Request: 1` CSRF header when
called with a session cookie — but a Bearer-token-authenticated request
skips that check entirely (tokens aren't ambient credentials the way
cookies are), so no extra header is needed here.
