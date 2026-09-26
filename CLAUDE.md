# CLAUDE.md

**Grabby**: point at any UI element, leave a comment, hand the feedback to an AI coding agent. Formerly `angular-grab`; renamed and reworked on 2026-09-26. The full plan it was built from is `~/.claude/plans/i-want-us-to-lively-hollerith.md`.

## Layout

pnpm 9 workspace + Turbo, Node 20+.

| Path | What |
|---|---|
| `packages/grabby` | `@githumbi/grabby`: browser toolbar, capture, framework adapters, build plugin, CLI (`grabby init`, `add mcp`, `pull`) |
| `packages/server` | `@githumbi/grabby-server`: self-hosted collector (`init`/`start`/`mcp`/`pull`), JSON file store, REST API, MCP tools |
| `examples/*` | `angular-19-app`, `react-vite`, `vue-vite`, `svelte-vite`, `plain-html` (`index.html` local mode, `live.html` live mode) |
| `scripts/check-size.mjs` | bundle budgets: loader and `/live` ≤ 1 KB gzip, script build ≤ 48 KB |

```bash
pnpm install && pnpm build && pnpm test   # all packages + examples
pnpm size                                 # bundle budgets
pnpm --dir examples/react-vite dev        # try it in an app
```

## How it fits together (packages/grabby/src)

- `core/grab.ts`: the engine (selection, comments, copy sheet, live mode, outbox, identity).
- `core/capture/`: `kind.ts` (action/field/text/media/container/section + promote icon→button), `facts.ts` (per-kind facts), `preview.ts` (≤300-char HTML preview), `styles.ts` (diff vs browser defaults), `redact.ts`, `export.ts` (Copy all / pull / MCP text), `screenshot.ts` (lazy modern-screenshot, Trusted-Types-safe sandbox).
- `core/adapters/`: React, Angular, Vue 2/3, Svelte 4/5, DOM, composed per element; `stamp.ts` reads `data-grabby-loc="file:line:col[:ComponentName]"`.
- `core/ui/`: everything renders in one `<grabby-root>` shadow root; `dom.ts` `h()` builder (no `innerHTML`, ever).
- `core/sync/outbox.ts`: delivery to a collector with retries (keepalive, plus a last try on pagehide); `core/live/activation.ts`: `?grabby=<projectKey>` feedback links; `core/toolbar/finish-sheet.ts`: the live **Finish review** summary (Done clears sent comments and keeps the toolbar).
- `plugin/`: unplugin build plugin (JSX/TSX + Vue SFC stamping, dev-only unless `includeSourceInBuild`).
- `live.ts` / `core/loader.global.ts`: lazy entry and ~500 B script loader for live sites.

## Rules

- **Context budget**: every captured field costs tokens in every export; keep `capture.test.ts` budget tests passing.
- **Privacy**: never capture form values or typed text; run captured text through `redact()`.
- **No `innerHTML`**: build UI with `h()`; user text must never become markup.
- **Adapters read, never import, frameworks.**
- Changes to published packages need a changeset (`pnpm changeset`), except the first 0.1.0 release (no changeset: the release workflow publishes the current versions).

## State (2026-09-26)

All five milestones plus the follow-ups are merged into `main` (PR #1, merge commit `445c73a`, 203 tests): the rename and security work, capture and Copy & clear, adapters and the build plugin, live mode and the collector, packaging, CI and docs, the CodeQL fixes, and live-mode **Finish review**. The history from the original angular-grab by Nate Richardson is kept on purpose (and his copyright line in `LICENSE`).

**Published on npm** (2026-09-26): `@githumbi/grabby` 0.1.0 and `@githumbi/grabby-server` 0.1.0, under the npm org `githumbi` (owned by npm user `thumbi74`). Both have GitHub Actions trusted publishing set up for `release.yml`.

**`main` is protected**: changes go through a PR; `test (20/22/24)`, `audit` and `analyze` must pass, the branch must be up to date and conversations resolved; admins included; no force-push or deletion.

Verified in a browser: React, Vue, Svelte, Angular, plain HTML; live mode with two reviewers (named + anonymous) end to end through the collector, `pull` and MCP; Finish review with the collector going down and coming back; strict CSP + Trusted Types with zero violations; a packed tarball installed into a fresh Vite app.

**Mobigrow portal** (`~/Documents/KCB work/Mobigrow/prototype`, repo `githumbi/mobigrow-portal`) uses Grabby via a vendored tarball (`vendor/githumbi-grabby-0.1.0-80950f4.tgz`, i.e. without the production component-name fix). It could now switch to `@githumbi/grabby` from npm. **Don't change the Mobigrow project unless the user asks**; they reverted the last update there.

## Next steps

1. Releases: add a changeset (`pnpm changeset`) in each PR that changes a published package. Merging to `main` makes `release.yml` open a "Version packages" PR; merging that publishes to npm with provenance.
2. Repo settings: enable private vulnerability reporting (SECURITY.md relies on it; it's off). One medium CodeQL alert is open by design (`js/http-to-file-access`, `cli.ts` `--out`); dismiss as won't fix.
3. Optional: delete the merged `grabby-m1`…`grabby-m5` and `react-support` branches; rename this folder to `~/Documents/grabby` (update `~/Documents/.claude/launch.json`, which points at `angular-grab/...`).

Backlog: a reviewer deleting an already-sent comment doesn't delete it on the collector; Turbopack isn't supported; Svelte 4 line numbers are untested (only Svelte 5 was run); the Docker image wasn't built (daemon was off; its install steps were replayed locally); a dashboard on the REST API; tsup → tsdown migration.
