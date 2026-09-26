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

Everything is merged into `main` and released. PR #1 (`445c73a`) brought in all five milestones: the rename and security work, capture and Copy & clear, adapters and the build plugin, live mode and the collector (with **Finish review**), and packaging, CI and docs. The history from the original angular-grab by Nate Richardson is kept on purpose (and his copyright line in `LICENSE`). PR #9 added supply-chain hardening (see `SECURITY.md`). 206 tests.

**On npm** (org `githumbi`, owned by npm user `thumbi74`):
- `@githumbi/grabby` **0.1.1**, the first release published by `release.yml` with provenance. 0.1.0 was published by hand.
- `@githumbi/grabby-server` **0.1.0**.
- Both packages use GitHub Actions trusted publishing with direct publish allowed, and tokens are disallowed.

**Supply chain.** Keep these intact:
- **pnpm 10.33.4.** Don't use 10.34.x, which was published without provenance.
- **`pnpm-workspace.yaml`:** no dependency install scripts (`strictDepBuilds`, all `allowBuilds` false), `minimumReleaseAge` of 7 days, `trustPolicy: no-downgrade` (for releases from the last 30 days) and `blockExoticSubdeps`.
- **Actions are pinned to commit SHAs**, workflows start with `permissions: {}`, checkouts don't keep credentials, and zizmor runs in CI.
- **`release.yml` is split:** build and test run in one job, and a separate publish job gets the built files as an artifact, uses no cache, and alone has `id-token: write`.
- **Dependabot** has a 7-day cooldown (30 days for majors).
- **The CLI pins exact versions** in everything it generates (`src/cli/versions.ts` gets them from `build-constants.ts` via tsup `define`).

**Releasing:**
1. Add a changeset to each PR that changes a published package.
2. After a merge, `release.yml` pushes `changeset-release/main`. Its "create PR" step fails because the repo doesn't let Actions open PRs (kept off on purpose; a PR opened with the workflow token wouldn't run CI anyway).
3. Open the "Version packages" PR from that branch by hand.
4. Merging it publishes the new version.

**`main` is protected:**
- Changes only through a PR.
- Required checks: `test (20/22/24)`, `audit`, `analyze` and `workflow security (zizmor)`.
- The branch must be up to date and conversations resolved.
- Admins included; no force-push or deletion.

Verified in a browser: React, Vue, Svelte, Angular, plain HTML; live mode with two reviewers (named + anonymous) end to end through the collector, `pull` and MCP; Finish review with the collector going down and coming back; SRI against jsDelivr; strict CSP + Trusted Types with zero violations.

**Mobigrow portal** (`~/Documents/KCB work/Mobigrow/prototype`, repo `githumbi/mobigrow-portal`) uses Grabby via a vendored tarball (`vendor/githumbi-grabby-0.1.0-80950f4.tgz`). It could now switch to `@githumbi/grabby` from npm. **Don't change the Mobigrow project unless the user asks**; they reverted the last update there.

## Next steps

1. Dependabot #10 (Angular 22 devkit) doesn't fit Angular 21: close it and ignore `@angular-devkit/*` majors in `.github/dependabot.yml`.
2. Optional: staged publishing (`npm stage publish` + 2FA approval) so even a compromised CI can't publish; dismiss the by-design CodeQL alert (`js/http-to-file-access`, `cli.ts` `--out`); delete the merged `grabby-m1`…`grabby-m5` and `react-support` branches; rename this folder to `~/Documents/grabby` (update `~/Documents/.claude/launch.json`).

Backlog: a reviewer deleting an already-sent comment doesn't delete it on the collector; Turbopack isn't supported; Svelte 4 line numbers are untested (only Svelte 5 was run); the Docker image wasn't built (daemon was off; its install steps were replayed locally); a dashboard on the REST API; tsup → tsdown migration.
