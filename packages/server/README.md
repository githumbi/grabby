# @githumbi/grabby-server

The collector for [Grabby](../../README.md): it receives UI comments from your site, stores them with their screenshots, and hands them to you and your AI agent through `pull` and MCP.

- One small Node process. No database, no native dependencies: comments live in a JSON file, screenshots next to it.
- Local by default. `--public` for a deployed site, and it won't start that way without keys and an origin allowlist.

## Commands

```bash
npx @githumbi/grabby-server init      # create config with a project key + admin token
npx @githumbi/grabby-server start     # run the collector (localhost:3456)
npx @githumbi/grabby-server mcp       # MCP server for Claude Code, Cursor, …
npx @githumbi/grabby-server pull      # print open comments, save screenshots, resolve them
```

Run `--help` for all options.

## Local development

`npx grabby add mcp` in your project writes an `.mcp.json` entry that runs `grabby-server mcp`. That one process is both the MCP server and a collector on `http://localhost:3456`. Point Grabby at it:

```ts
initGrabby({ server: 'http://localhost:3456' });
```

Locally there are no keys: it only listens on 127.0.0.1, only accepts pages served from localhost, `*.localhost` or `*.test`, and rejects requests whose Host header isn't local (DNS rebinding).

## Deploying for a live site

1. Create keys, listing the sites allowed to send comments:

   ```bash
   npx @githumbi/grabby-server init --origin https://your-site.com --origin https://staging.your-site.com
   ```

   This prints a **project key** (`pk_…`, public, goes in your site) and an **admin token** (`sk_…`, secret). The config is saved to `~/.grabby/config.json` with owner-only permissions.

2. Run it somewhere with a persistent disk, behind HTTPS.

   **Docker** (build from this folder after `pnpm build`):

   ```bash
   docker run -d -p 3456:3456 -v grabby-data:/data \
     -e GRABBY_PUBLIC_KEY=pk_… -e GRABBY_ADMIN_TOKEN=sk_… \
     -e GRABBY_ALLOWED_ORIGINS=https://your-site.com \
     grabby-server
   ```

   **Fly.io / Render / Railway**: use the Dockerfile, mount a volume at `/data`, and set the three variables above as secrets. Put it on its own subdomain (`feedback.your-site.com`) with TLS terminated by the platform.

   **Any Node 20+ host**:

   ```bash
   GRABBY_PUBLIC_KEY=pk_… GRABBY_ADMIN_TOKEN=sk_… GRABBY_ALLOWED_ORIGINS=https://your-site.com \
     npx @githumbi/grabby-server start --public
   ```

3. Add Grabby to your site with `mode: 'live'`, the server URL and the project key (see the main README), and share `https://your-site.com/?grabby=pk_…`.

4. Pull feedback:

   ```bash
   npx -y @githumbi/grabby-server@0.1.0 pull --server https://feedback.your-site.com --token sk_…
   ```

   Or give your agent the deployed collector over MCP:

   ```json
   { "mcpServers": { "grabby": { "command": "npx", "args": ["-y", "@githumbi/grabby-server@0.1.0", "mcp", "--server", "https://feedback.your-site.com"], "env": { "GRABBY_ADMIN_TOKEN": "sk_…" } } }
   ```

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
| `GET /health` | none | liveness |

The project key goes in `X-Grabby-Key`, the admin token in `Authorization: Bearer`. Limits: 60 comment writes per minute per IP (30 per browser session), 20 screenshots per minute per IP, 64 KB per comment.

## Security

- Every field is validated and capped; unknown fields are dropped and records are rebuilt, never stored as received.
- Screenshots are identified by their bytes, served with `nosniff` and a `default-src 'none'` CSP.
- Only the browser session that created a comment can update it or attach its screenshot.
- Admin tokens are compared in constant time. Keep the admin token out of your site and your repository.
- Comment text reaches your AI agent. MCP results label it as untrusted user input; treat it that way.
