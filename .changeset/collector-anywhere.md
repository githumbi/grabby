---
"@githumbi/grabby-server": minor
---

The collector now runs on Cloudflare Workers as well as Node, and gains an inbox and alerts:

- `grabby-server deploy cloudflare` puts the collector in your own free Cloudflare account (Workers + D1, no card) on a permanent `*.workers.dev` address, so comments arrive while your computer is off. Usually run for you by `npx @githumbi/grabby share`.
- A web inbox at `/inbox`, opened with a private link: every comment with its screenshot, author, page and `file:line`, resolve/reopen/delete, and **Copy all for AI**. The link uses its own revocable token (`POST /v1/admin/inbox-token`), which can read and resolve but never change settings.
- Slack and webhook alerts for new feedback, one message per burst (`PUT /v1/admin/alerts`, or `GRABBY_SLACK_WEBHOOK` / `GRABBY_WEBHOOK_URL`).
- `pull` and `mcp` read the project's `.grabby/config.json` (written by `grabby share`), so they need no flags.
- New `GET /v1/meta`. Existing `/v1` routes, data and config files keep working.
