# CLAUDE.md

**Grabby**: point at any UI element, leave a comment, hand the feedback to an AI coding agent. Formerly `angular-grab`; renamed and reworked on 2026-09-26. The full plan it was built from is `~/.claude/plans/i-want-us-to-lively-hollerith.md`.

## Layout

pnpm 9 workspace + Turbo, Node 20+.

| Path | What |
|---|---|
| `packages/grabby` | `@githumbi/grabby`: browser toolbar, capture, framework adapters, build plugin, CLI (`init`, `share`, `inbox`, `alerts`, `add mcp`, `pull`) |
| `packages/server` | `@githumbi/grabby-server`: the collector (`init`/`start`/`mcp`/`pull`/`deploy cloudflare`), REST API, inbox, alerts, MCP tools. Runs on Node (JSON file store) and as a Cloudflare Worker (D1) |
| `examples/*` | `angular-19-app`, `react-vite`, `vue-vite`, `svelte-vite`, `plain-html` (`index.html` local mode, `live.html` live mode) |
| `scripts/check-size.mjs` | bundle budgets: loader and `/live` ≤ 1 KB gzip, script build ≤ 56 KB, Worker (inbox included) ≤ 64 KB |

```bash
pnpm install && pnpm build && pnpm test   # all packages + examples
pnpm size                                 # bundle budgets
pnpm --dir examples/react-vite dev        # try it in an app
```

## How it fits together (packages/grabby/src)

- `core/grab.ts`: the engine (selection, comments, copy sheet, live mode, outbox, identity, toolbar collapse, markers, group/area comments).
- `core/picker/`: `element-picker.ts` (hover, click, **drag to select**, **⌘/Ctrl-click to collect**, **hold** the selection while a comment is written; swallows presses on `window` capture while picking) and `region.ts` (which elements a drag box takes in, the common container, areas as fractions).
- `core/overlay/`: `overlay-renderer.ts` (blue single-element highlight), `group-outline.ts` (green outlines for groups and areas, the drag marquee), `markers.ts` (numbered pins per page: a page-coordinate layer for page content, a fixed layer for fixed/sticky/scrolling-box content), `crosshair.ts`, `freeze-overlay.ts`, `toast.ts`.
- `core/capture/`: `kind.ts` (action/field/text/media/container/section + promote icon→button), `facts.ts` (per-kind facts), `preview.ts` (≤300-char HTML preview), `styles.ts` (diff vs browser defaults), `redact.ts`, `export.ts` (Copy all / pull / MCP text), `screenshot.ts` (lazy modern-screenshot, Trusted-Types-safe sandbox).
- `core/adapters/`: React, Angular, Vue 2/3, Svelte 4/5, DOM, composed per element; `stamp.ts` reads `data-grabby-loc="file:line:col[:ComponentName]"`.
- `core/toolbar/`: `toolbar-renderer.ts` (bar and collapsed corner button, the morph animation), `comment-popover.ts` (new/edit, heading, Delete/Cancel/Save when editing), `comments-panel.ts`, `copy-sheet.ts`, `finish-sheet.ts`, `coach-mark.ts`.
- `core/ui/`: everything renders in one `<grabby-root>` shadow root; `dom.ts` `h()` builder (no `innerHTML`, ever).
- `core/sync/outbox.ts`: delivery to a collector with retries (keepalive, plus a last try on pagehide); `core/live/activation.ts`: `?grabby=<projectKey>` feedback links; `core/toolbar/finish-sheet.ts`: the live **Finish review** summary (Done clears sent comments and keeps the toolbar).
- `plugin/`: unplugin build plugin (JSX/TSX + Vue SFC stamping, dev-only unless `includeSourceInBuild`).
- `live.ts` / `core/loader.global.ts`: lazy entry and ~500 B script loader for live sites.

## The collector (packages/server/src)

- `core/`: runtime-neutral. `handler.ts` is `createHandler(config, deps) → (Request, Peer) → Response` with every route and check (keys, origins, CORS, Host, rate limits, session-bound screenshots, inbox and admin routes). `storage.ts` is the async `Storage` interface; `memory-storage.ts` the reference. `alerts.ts` batches Slack/webhook alerts (claim in storage, send in `waitUntil`). Web APIs only: no `Buffer`, `fs` or `node:*` in `core/`.
- `node/`: `bridge.ts` (node:http ↔ Request/Response) and `file-storage.ts` (wraps the JSON `CommentStore`, plus `settings.json`). `http.ts` wires them.
- `worker/`: `index.ts` (Worker entry, fails closed with 503 until configured) and `d1-storage.ts` (schema created on first use). tsup builds it into one self-contained `dist/worker/worker.js`.
- `deploy/cloudflare.ts`: `deployCloudflare()` drives Wrangler (`WRANGLER_VERSION`, exact, ≥ 7 days old; bump it on purpose) through a `WranglerRunner` that tests fake. The admin token goes in `--secrets-file`, never argv.
- `inbox/`: the inbox page (`inbox.ts`, `dom.ts` with `h()`, no `innerHTML`). `scripts/build-inbox.mjs` bundles it into the gitignored `inbox/generated.ts` before build, test and typecheck; run `pnpm typecheck` there, since `tsc` alone needs the generated file.
- `project-config.ts`: reads `<project>/.grabby/config.json` (written by `grabby share`), so `pull`/`mcp` need no flags.
- Storage behaviour is pinned by `core/__tests__/storage-contract.ts`, run against memory, file and D1 (on `node:sqlite`, Node ≥ 22.5).

The `grabby share` CLI (`packages/grabby/src/cli/commands/share.ts`) runs the server package for the deploy step; set `GRABBY_SERVER_BIN=<path to packages/server/dist/cli.js>` to use a local build instead of the pinned npm release.

## Rules

- **Context budget**: every captured field costs tokens in every export; keep `capture.test.ts` budget tests passing.
- **Privacy**: never capture form values or typed text; run captured text through `redact()`.
- **No `innerHTML`**: build UI with `h()`; user text must never become markup.
- **Adapters read, never import, frameworks.**
- **Browser-only fields stay in the browser**: `sync` and `pin` are stripped in `outbox.ts` `wireShape` and in the webhook plugin; never add them to exports.
- **Picking listens to pointer *and* mouse events.** Pages often cancel `pointerdown` while Grabby picks (to keep their menus shut), and the browser then stops sending `mousemove`/`mousedown`/`mouseup` until `pointerup`. Never cancel `pointerdown` yourself, for the same reason; cancel `mousedown`.
- **Markers must not trail scrolling**: anything that should move with the page goes in page coordinates (absolute in `<grabby-root>`), not a fixed layer repositioned from `requestAnimationFrame`.
- **This repo is public.** No client or project names, real project keys or collector URLs in code, tests, docs, commit messages or PR text; use `example`, `Acme`, `jane.workers.dev`.
- Changes to published packages need a changeset (`pnpm changeset`), except the first 0.1.0 release (no changeset: the release workflow publishes the current versions).

## State (2026-11-23)

Everything is merged into `main` and released. The history from the original angular-grab by Nate Richardson is kept on purpose (and his copyright line in `LICENSE`). 243 tests in `@githumbi/grabby`, 58 in `@githumbi/grabby-server`.

**On npm** (org `githumbi`, owned by npm user `thumbi74`), both published by `release.yml` with provenance through GitHub Actions trusted publishing (tokens are disallowed; each trusted publisher's **Allowed actions** must include direct `npm publish`, or publishing fails with E403 "OIDC permission denied"):
- `@githumbi/grabby` **0.6.1**
- `@githumbi/grabby-server` **0.6.0**

**What shipped on 2026-11-23** (PRs #31–#43):

| Version | What |
|---|---|
| 0.3.0 | Typing "g" no longer closes the comment box; deleting a sent comment deletes it on the collector; reviewer plain labels |
| 0.4.0 | The clicked element stays selected (held) while its comment is written; the toolbar's close button collapses it to a corner button (remembered per tab in `sessionStorage` `grabby:v1:collapsed`) |
| 0.5.0 | Numbered markers per page (`pin` = click point as fractions of the element); hover previews, click edits with Delete/Cancel/Save; hidden on other routes (pathname + `#/` hash) and while collapsed; the toolbar morphs between bar and corner button (ease-out expo, blur/scale content, reduced-motion respected) |
| 0.5.1 | Markers for page content live in page coordinates, so they no longer trail scrolling |
| 0.6.0 | Drag to select several elements (outermost ≥ 85% inside, max 20) or an area (nothing inside → region of the smallest containing element); ⌘/Ctrl-click to collect; comments carry `members` or `area`, `target` is the container; green square markers; screenshots cropped to the selection; collector validates/stores both; inbox and export list every element. Script budget raised to 56 KB |
| 0.6.1 | Drags are followed with `pointermove` too, so they work on pages that cancel `pointerdown` |

The behaviour of markers, collapse animation and multi-select was modelled on agentation.com's UX, implemented from scratch.

**Flaky test:** `packages/server` `handler.test.ts > never builds alert links from a forged Host header` fails about one run in three locally (also on clean `main`); CI has passed every time. Rerun before suspecting a change.

**Supply chain.** Keep these intact:
- **pnpm 10.33.4.** Don't use 10.34.x, which was published without provenance.
- **`pnpm-workspace.yaml`:** no dependency install scripts (`strictDepBuilds`, all `allowBuilds` false), `minimumReleaseAge` of 7 days, `trustPolicy: no-downgrade` (for releases from the last 30 days) and `blockExoticSubdeps`.
- **Actions are pinned to commit SHAs**, workflows start with `permissions: {}`, checkouts don't keep credentials, and zizmor runs in CI.
- **`release.yml` is split:** build and test run in one job, and a separate publish job gets the built files as an artifact, uses no cache, and alone has `id-token: write`.
- **Dependabot** has a 7-day cooldown (30 days for majors), and each major update gets its own PR. `@angular/*` majors and `@angular-devkit/*` minors and majors are ignored: devkit is versioned `0.MMmm.p`, so a new Angular release arrives as a minor, and it must move together with `@angular/build`.
- **The CLI pins exact versions** in everything it generates (`src/cli/versions.ts` gets them from `build-constants.ts` via tsup `define`).
- **Always write `npx @githumbi/grabby …`, never `npx grabby`.** `grabby` on npm is an unrelated package from another maintainer.

**Releasing:**
1. Add a changeset to each PR that changes a published package.
2. After a merge, `release.yml` pushes `changeset-release/main`. Its "create PR" step fails because the repo doesn't let Actions open PRs (kept off on purpose; a PR opened with the workflow token wouldn't run CI anyway).
3. Open the "Version packages" PR from that branch by hand. Check the branch first with `gh api repos/githumbi/grabby/compare/main...changeset-release/main`: it should be 1 commit ahead and 0 behind.
4. Wait for that PR's checks (`gh pr checks <n> --watch`; merging before they finish is refused), then merge: it publishes the new version.
5. Confirm it on npm, then run `npm audit signatures`. **npm lists the version minutes before its tarball downloads**: `https://registry.npmjs.org/@githumbi/grabby/-/grabby-<v>.tgz` returns 404 and jsDelivr returns 502 until it does (about 5 minutes on 2026-11-23). Wait for both before pointing a site's script tag at the new version.

To bring a PR branch up to date with `main`, merge `main` into it rather than rebasing: force-pushing is blocked for the agent (PRs are squash-merged, so the merge commit never reaches `main`).

**`main` is protected:**
- Changes only through a PR.
- Required checks: `test (20/22/24)`, `audit`, `analyze` and `workflow security (zizmor)`.
- The branch must be up to date and conversations resolved.
- Admins included; no force-push or deletion.

**README** (`README.md`, copied to `packages/grabby/README.md` at build):
- Structure: customer/stakeholder feedback first (intro, How it works, "Get feedback on your live site" step by step with `share`, Everyday tasks, Troubleshooting, own server, tag by hand), then What gets captured and Connect your AI agent, then **Developer mode** near the end, then framework, configuration and security reference. Keep that order: live feedback is the product's main use.
- Screenshots: 7 in `docs/images/`, linked by absolute `raw.githubusercontent.com/githumbi/grabby/main/docs/images/…` URLs so they also render on npm. They were captured from the running examples (React on :5181, plain-html `live.html` with the collector on :3456) by puppeteer-core driving Brave, headless with a throwaway profile, at 1200×640 and deviceScaleFactor 2. The script wasn't committed.

**GitHub About section:** the description, homepage (the npm page) and topics are set. The old `angular-grab.com` link is gone.

**Local testing:** `~/Documents/.claude/launch.json` has the examples plus `grabby-collector`, which runs the local server build on :3456 with demo keys `pk_demo_local_only` / `sk_demo_local_only_not_secret`. The live page is `http://localhost:5184/live.html?grabby=pk_demo_local_only`.

Verified in a browser: React, Vue, Svelte, Angular, plain HTML; live mode with two reviewers (named + anonymous) end to end through the collector, `pull` and MCP; Finish review with the collector going down and coming back; SRI against jsDelivr; strict CSP + Trusted Types with zero violations.


## Next steps

1. **Review the Dependabot PRs one at a time.** None has been looked at yet (#33 bumps the pinned Actions group):

   | PR | Update | Notes |
   |---|---|---|
   | #18 | `@types/node` 25 → 26 | Likely quick |
   | #19 | `vitest` 2 → 4 | Test runner; check the vitest config and jsdom |
   | #15 | `@vitejs/plugin-vue` 5 → 6 | Example app |
   | #17 | `@vitejs/plugin-react` 4 → 6 | Example app |
   | #16 | `@babel/core` 7 → 8 | **Runtime dependency.** Breaking for users; plan it as a release with a changeset |

   CI doesn't run `tsc --noEmit`, so run it locally in `packages/grabby` and `packages/server` for each.
2. Optional:
   - Staged publishing (`npm stage publish` + 2FA approval), so even a compromised CI can't publish.
   - Add `tsc --noEmit` to CI.
   - Dismiss the by-design CodeQL alert (`js/http-to-file-access`, `cli.ts` `--out`).
   - Delete the merged `grabby-m1`…`grabby-m5`, `react-support` and old feature branches.
   - Fix the flaky forged-Host alert test (see State).

Backlog: Turbopack isn't supported; Svelte 4 line numbers are untested (only Svelte 5 was run); the Docker image wasn't built (daemon was off; its install steps were replayed locally); a dashboard on the REST API; tsup → tsdown migration.
