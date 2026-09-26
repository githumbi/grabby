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
- `core/sync/outbox.ts`: delivery to a collector with retries; `core/live/activation.ts`: `?grabby=<projectKey>` feedback links.
- `plugin/`: unplugin build plugin (JSX/TSX + Vue SFC stamping, dev-only unless `includeSourceInBuild`).
- `live.ts` / `core/loader.global.ts`: lazy entry and ~500 B script loader for live sites.

## Rules

- **Context budget**: every captured field costs tokens in every export; keep `capture.test.ts` budget tests passing.
- **Privacy**: never capture form values or typed text; run captured text through `redact()`.
- **No `innerHTML`**: build UI with `h()`; user text must never become markup.
- **Adapters read, never import, frameworks.**
- Changes to published packages need a changeset (`pnpm changeset`), except the first 0.1.0 release (no changeset: the release workflow publishes the current versions).

## State (2026-09-26)

All five milestones are built, tested (187 tests) and committed on stacked branches; `grabby-m5` is pushed with a PR into `main`:
`grabby-m1` rename + security → `grabby-m2` capture + Copy & clear → `grabby-m3` adapters + plugin → `grabby-m4` live mode + server → `grabby-m5` packaging, CI, docs, plus two fixes found on the Mobigrow portal (short hover label; real component names in production React builds). `grabby-m5` contains everything; `main` and `react-support` are still at the old angular-grab code (`2c7a9f7`).

Verified in a browser: React, Vue, Svelte, Angular, plain HTML; live mode with two reviewers (named + anonymous) end to end through the collector, `pull` and MCP; strict CSP + Trusted Types with zero violations; a packed tarball installed into a fresh Vite app.

**Mobigrow portal** (`~/Documents/KCB work/Mobigrow/prototype`, repo `githumbi/mobigrow-portal`) uses Grabby via a vendored tarball (`vendor/githumbi-grabby-0.1.0-80950f4.tgz`, i.e. without the production component-name fix). **Don't change the Mobigrow project unless the user asks**; they reverted the last update there.

## Next steps

1. ~~Rename the repo to `githumbi/grabby`~~ (done 2026-09-26; `origin` updated).
2. Review and merge the PR from `grabby-m5` into `main` (it contains m1–m4). CI (`.github/workflows/ci.yml`) runs on it.
3. Repo settings: enable private vulnerability reporting (SECURITY.md relies on it); optionally protect `main`.
4. First npm publish of `@githumbi/grabby` and `@githumbi/grabby-server` 0.1.0, by hand with 2FA (`pnpm build`, then `pnpm publish --access public` in each package), because npm trusted publishing can only be configured on a package that already exists. Then on npmjs.com add GitHub Actions trusted publishing (repo `githumbi/grabby`, workflow `release.yml`) for both, and later releases go through Changesets.
5. Optional: rename this folder to `~/Documents/grabby` (update `~/Documents/.claude/launch.json`, which points at `angular-grab/...`).

Backlog: a reviewer deleting an already-sent comment doesn't delete it on the collector; Turbopack isn't supported; Svelte 4 line numbers are untested (only Svelte 5 was run); the Docker image wasn't built (daemon was off; its install steps were replayed locally); a dashboard on the REST API; tsup → tsdown migration.
