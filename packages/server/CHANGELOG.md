# @githumbi/grabby-server

## 0.6.0

### Minor Changes

- dea0d95: Comment on several elements, or on an area, at once.
  
  - **Drag to select.** In comment mode, press and drag: a box follows the mouse and the elements it takes in are outlined in green as you go. Let go and one comment covers all of them ("3 elements: Button “Approve”, Button “Reject”, Text “Total”"). A drag that takes in a single element is an ordinary comment, and a plain click works as before.
  - **⌘-click (Ctrl-click on Windows and Linux)** adds elements one at a time; release the key to comment on them together.
  - **Areas.** A drag over empty space comments on that region ("Area in Card “Your plan”"), saved relative to the element around it.
  - Group and area comments get a green square marker; hovering it outlines every element (or the area) again, and clicking it edits the comment. Their screenshot shows just the selected region.
  - While picking, Grabby keeps presses from reaching the page, so dragging doesn't select text and pickers that open on pointer-down stay closed.
  - Comments carry `members` (one short entry per element: kind, tag, component, source, selector, preview and a plain label) or `area` (fractions of the element's box); `target` is the element around them. The export, `pull`, MCP and the inbox list every element with its file and line. The collector stores both; an older collector accepts these comments as single-element ones.

## 0.3.0

### Patch Changes

- 65cb4e5: Security update: `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7 (fixes the high-severity advisories `pnpm audit` reported, plus patched `body-parser`, `hono`, `qs` and `fast-uri` underneath). Comment validation moved to `zod/mini` with English messages only, so the Cloudflare Worker is smaller than before (26 KB gzip, was 31 KB); validation results and error messages are unchanged.
- 45343a4: Deleting a comment that was already sent now deletes it on the feedback server too, so `pull`, the inbox and MCP no longer return it. The delete waits out the 8-second Undo window (Undo cancels it), is retried like any send, and goes out at once if the reviewer leaves the page. The collector accepts it only from the browser session that wrote the comment, with the project key and an allowed site, as for screenshots. Finish review's Done and `clearComments()` still only tidy the reviewer's browser.

## 0.2.0

### Minor Changes

- 27eec19: The collector now runs on Cloudflare Workers as well as Node, and gains an inbox and alerts:
  
  - `grabby-server deploy cloudflare` puts the collector in your own free Cloudflare account (Workers + D1, no card) on a permanent `*.workers.dev` address, so comments arrive while your computer is off. Usually run for you by `npx @githumbi/grabby share`.
  - A web inbox at `/inbox`, opened with a private link: every comment with its screenshot, author, page and `file:line`, resolve/reopen/delete, and **Copy all for AI**. The link uses its own revocable token (`POST /v1/admin/inbox-token`), which can read and resolve but never change settings.
  - Slack and webhook alerts for new feedback, one message per burst (`PUT /v1/admin/alerts`, or `GRABBY_SLACK_WEBHOOK` / `GRABBY_WEBHOOK_URL`).
  - `pull` and `mcp` read the project's `.grabby/config.json` (written by `grabby share`), so they need no flags.
  - New `GET /v1/meta`. Existing `/v1` routes, data and config files keep working.

### Patch Changes

- 27eec19: `start --public` now listens on all interfaces even when the config file came from an older `init`, which saved `"host": "127.0.0.1"` and kept a public collector unreachable. `init` no longer writes `host` or `port`.

## 0.1.0

First release as the Grabby collector (formerly angular-grab-mcp).

- `init`, `start`, `mcp` and `pull` commands; JSON file store with no native dependencies.
- Local mode (loopback, no keys, DNS-rebinding protection) and public mode (project key, admin token, origin allowlist, rate limits).
- REST API for comments and screenshots; MCP tools to list, get (with screenshot), resolve and count comments.
