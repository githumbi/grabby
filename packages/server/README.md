# @githumbi/grabby-server

The collector for [Grabby](../../README.md): it receives UI comments from your site, stores them with their screenshots, and hands them to you through a web inbox, `pull`, MCP and Slack alerts.

- Runs as a **Cloudflare Worker** (with D1) or as **one small Node process** (comments in a JSON file, screenshots next to it). Same API and inbox either way.
- Local by default. Public only with keys and an origin allowlist.

Most people never run this package directly: `npx @githumbi/grabby share` deploys it and connects your site.

## Commands

```bash
npx @githumbi/grabby-server init      # create config with a project key + admin token
npx @githumbi/grabby-server start     # run the collector (localhost:3456)
npx @githumbi/grabby-server mcp       # MCP server for Claude Code, Cursor, …
npx @githumbi/grabby-server pull      # print open comments, save screenshots, resolve them
npx @githumbi/grabby-server deploy cloudflare --origin https://your-site.com
                                      # put it in your own Cloudflare account
```

Run `--help` for all options.

## Local development

`npx @githumbi/grabby add mcp` in your project writes an `.mcp.json` entry that runs `grabby-server mcp`. That one process is both the MCP server and a collector on `http://localhost:3456`. Point Grabby at it:

```ts
initGrabby({ server: 'http://localhost:3456' });
```

Locally there are no keys: it only listens on 127.0.0.1, only accepts pages served from localhost, `*.localhost` or `*.test`, and rejects requests whose Host header isn't local (DNS rebinding).

## Deploying for a live site

### Cloudflare (recommended)

```bash
npx @githumbi/grabby share     # in your site's project folder
```

This runs `grabby-server deploy cloudflare` for you: a Worker and a D1 database in your own Cloudflare account (free plan, no card), on a permanent `https://grabby-<project>.<you>.workers.dev` address. It signs you in with Wrangler's browser login the first time (or uses `CLOUDFLARE_API_TOKEN`; set `CLOUDFLARE_ACCOUNT_ID` if you have several accounts), keeps the admin token as a Worker secret, and deploys the exact `dist/worker/worker.js` from this package. Re-running reuses the database and keeps the token; it's also how you upgrade.

On Cloudflare, screenshots are capped at 1.9 MB (D1's row limit). Grabby's WebP captures are usually well under 500 KB.

### Your own server

1. Create keys, listing the sites allowed to send comments:

   ```bash
   npx @githumbi/grabby-server init --origin https://your-site.com --origin https://staging.your-site.com
   ```

   This prints a **project key** (`pk_…`, public, goes in your site) and an **admin token** (`sk_…`, secret). The config is saved to `~/.grabby/config.json` with owner-only permissions.

2. Run it somewhere with a persistent disk, behind HTTPS.

   **Any Node 20+ host**:

   ```bash
   GRABBY_PUBLIC_KEY=pk_… GRABBY_ADMIN_TOKEN=sk_… GRABBY_ALLOWED_ORIGINS=https://your-site.com \
     GRABBY_PUBLIC_URL=https://feedback.your-site.com npx @githumbi/grabby-server start --public
   ```

   **Docker** (build from this folder after `pnpm build`):

   ```bash
   docker run -d -p 3456:3456 -v grabby-data:/data \
     -e GRABBY_PUBLIC_KEY=pk_… -e GRABBY_ADMIN_TOKEN=sk_… \
     -e GRABBY_ALLOWED_ORIGINS=https://your-site.com -e GRABBY_PUBLIC_URL=https://feedback.your-site.com \
     grabby-server
   ```

   Hosting platforms usually tell the app which port to use: set `GRABBY_PORT` to it.

3. Connect your site, which adds the script and gives you the inbox link:

   ```bash
   npx @githumbi/grabby share --server https://feedback.your-site.com --token sk_…
   ```

### Reading feedback

- **Inbox:** `https://<collector>/inbox#k=ik_…`, created by `share` (or `POST /v1/admin/inbox-token`). `npx @githumbi/grabby inbox` opens it.
- **Terminal and agents:** in a project where `share` ran, `pull` and `mcp` read `.grabby/config.json` and need no flags. Elsewhere, pass `--server <url> --token <sk_…>`:

  ```json
  { "mcpServers": { "grabby": { "command": "npx", "args": ["-y", "@githumbi/grabby-server@<version>", "mcp", "--server", "https://feedback.your-site.com"], "env": { "GRABBY_ADMIN_TOKEN": "sk_…" } } }
  ```

- **Alerts:** `npx @githumbi/grabby alerts --slack <incoming webhook>` or `--webhook <https url>`, or set `GRABBY_SLACK_WEBHOOK` / `GRABBY_WEBHOOK_URL` on the server. One message per burst of comments, sent about 20 seconds after the first.

## Configuration

Settings come from the config file, overridden by environment variables:

| Variable | |
|---|---|
| `GRABBY_PUBLIC` | `1` to accept comments from other machines |
| `GRABBY_PUBLIC_KEY` | project key sites use to send comments |
| `GRABBY_ADMIN_TOKEN` | secret for reading, resolving, deleting |
| `GRABBY_ALLOWED_ORIGINS` | comma-separated sites allowed to send comments |
| `GRABBY_HOST`, `GRABBY_PORT` | default `127.0.0.1` (`0.0.0.0` when public), `3456` |
| `GRABBY_DATA_DIR` | default `~/.grabby` (`/data` in Docker) |
| `GRABBY_SERVER` | default collector for `pull` and `mcp` |
| `GRABBY_PUBLIC_URL` | this collector's own https address, for inbox links in alerts (Node) |
| `GRABBY_SLACK_WEBHOOK`, `GRABBY_WEBHOOK_URL` | alert targets; they override ones set with `grabby alerts` |

## HTTP API

Versioned, so a dashboard can be built on it.

| | Auth | |
|---|---|---|
| `POST /v1/comments` | project key + allowed origin | add or update (same browser session) a comment |
| `PUT /v1/comments/:id/screenshot` | project key + the comment's session | WebP, PNG or JPEG, 2 MB max |
| `GET /v1/comments?status=open\|resolved\|all&author=&route=&since=` | admin token | list |
| `GET /v1/comments/:id` | admin token | one comment |
| `PATCH /v1/comments/:id` `{ "status": "resolved" }` | admin token | resolve or reopen |
| `DELETE /v1/comments/:id` | admin token | delete |
| `POST /v1/comments/bulk` `{ "ids": [], "action": "resolve"\|"reopen"\|"delete" }` | admin token | bulk |
| `GET /v1/screenshots/:id` | admin token | the image |
| `GET /v1/export?level=standard&status=open` | admin token | the Copy all markdown |
| `GET /v1/meta` | admin or inbox token | version, project key and allowed origins, alert status |
| `POST /v1/admin/inbox-token` | admin token | a new inbox link (`{ token, url }`); the old one stops working |
| `GET`, `PUT /v1/admin/alerts` `{ "slack": url\|null, "webhook": url\|null }` | admin token | alert targets |
| `POST /v1/admin/alerts/test` | admin token | send a test alert |
| `GET /inbox` | none (the page asks for its link) | the inbox |
| `GET /health` | none | liveness |

The project key goes in `X-Grabby-Key`, the admin or inbox token in `Authorization: Bearer`. The inbox token (`ik_…`) can do everything the admin token can except the `/v1/admin` routes. Limits: 60 comment writes per minute per IP (30 per browser session), 20 screenshots per minute per IP, 64 KB per comment.

## Security

- Every field is validated and capped; unknown fields are dropped and records are rebuilt, never stored as received.
- Screenshots are identified by their bytes, served with `nosniff` and a `default-src 'none'` CSP.
- Only the browser session that created a comment can update it or attach its screenshot.
- Admin tokens are compared in constant time; only a hash of the inbox token is stored. Keep the admin token out of your site and your repository (`share` keeps it in the gitignored `.grabby/config.json`).
- The inbox page runs under `script-src 'self'` with no inline code, builds its DOM without `innerHTML`, and fetches screenshots with the token rather than putting it in image URLs.
- Alerts go only to `https://hooks.slack.com` (Slack format, with reviewer text escaped so it can't trigger @-mentions) or to an `https://` webhook.
- Comment text reaches your AI agent. MCP results label it as untrusted user input; treat it that way.
