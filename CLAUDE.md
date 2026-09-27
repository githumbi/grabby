# CLAUDE.md

**Grabby**: point at any UI element, leave a comment, hand the feedback to an AI coding agent. Formerly `angular-grab`; renamed and reworked on 2026-09-26. The full plan it was built from is `~/.claude/plans/i-want-us-to-lively-hollerith.md`.

## Layout

pnpm 9 workspace + Turbo, Node 20+.

| Path | What |
|---|---|
| `packages/grabby` | `@githumbi/grabby`: browser toolbar, capture, framework adapters, build plugin, CLI (`init`, `share`, `inbox`, `alerts`, `add mcp`, `pull`) |
| `packages/server` | `@githumbi/grabby-server`: the collector (`init`/`start`/`mcp`/`pull`/`deploy cloudflare`), REST API, inbox, alerts, MCP tools. Runs on Node (JSON file store) and as a Cloudflare Worker (D1) |
| `examples/*` | `angular-19-app`, `react-vite`, `vue-vite`, `svelte-vite`, `plain-html` (`index.html` local mode, `live.html` live mode) |
| `scripts/check-size.mjs` | bundle budgets: loader and `/live` ≤ 1 KB gzip, script build ≤ 48 KB, Worker (inbox included) ≤ 64 KB |

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
- Changes to published packages need a changeset (`pnpm changeset`), except the first 0.1.0 release (no changeset: the release workflow publishes the current versions).

## State (2026-09-27)

Everything is merged into `main` and released. PR #1 (`445c73a`) brought in all five milestones: the rename and security work, capture and Copy & clear, adapters and the build plugin, live mode and the collector (with **Finish review**), and packaging, CI and docs. The history from the original angular-grab by Nate Richardson is kept on purpose (and his copyright line in `LICENSE`). PR #9 added supply-chain hardening (see `SECURITY.md`). PR #13 rewrote the README (see below).

**0.2.0** (PR #22, `27eec19`) made customer and stakeholder feedback the main path: `npx @githumbi/grabby share` puts the collector in the developer's own Cloudflare account (Worker + D1) or connects `--server`, patches the site (Next.js layouts included), and saves a gitignored `.grabby/config.json`. It also added the web inbox (`/inbox#k=ik_…`), Slack/webhook alerts, flag-free `pull`/MCP, a 14-day outbox retry and the `--public` host fix. The collector was split into a runtime-neutral core with Node and Worker adapters (see "The collector" above). 255 tests.

Verified for real on the procurement portal (Next.js on Netlify, `~/Documents/KCB work/procurement-portal`): sign-in, D1 creation, deploy, layout patching, comments with screenshots in the inbox, then an upgrade from a local build to the released 0.2.0 with the same links. Its collector is `https://grabby-procurement-portal.githumbi74.workers.dev`.

**On npm** (org `githumbi`, owned by npm user `thumbi74`):
- `@githumbi/grabby` **0.2.0** and `@githumbi/grabby-server` **0.2.0**, published by `release.yml` with provenance (Version packages PR #23, `8112a21`). They're linked in `.changeset/config.json`, so they move together. 0.1.1 was the first automated release; 0.1.0 was published by hand.
- Both packages use GitHub Actions trusted publishing, and tokens are disallowed. On npmjs.com each trusted publisher's **Allowed actions** must include direct `npm publish`: new ones are stage-only by default, which fails with E403 "OIDC permission denied".

**Supply chain.** Keep these intact:
- **pnpm 10.33.4.** Don't use 10.34.x, which was published without provenance.
- **`pnpm-workspace.yaml`:** no dependency install scripts (`strictDepBuilds`, all `allowBuilds` false), `minimumReleaseAge` of 7 days, `trustPolicy: no-downgrade` (for releases from the last 30 days) and `blockExoticSubdeps`.
- **Actions are pinned to commit SHAs**, workflows start with `permissions: {}`, checkouts don't keep credentials, and zizmor runs in CI.
- **`release.yml` is split:** build and test run in one job, and a separate publish job gets the built files as an artifact, uses no cache, and alone has `id-token: write`.
- **Dependabot** has a 7-day cooldown (30 days for majors), and each major update gets its own PR. `@angular/*` majors and `@angular-devkit/*` minors and majors are ignored: devkit is versioned `0.MMmm.p`, so a new Angular release arrives as a minor, and it must move together with `@angular/build`.
- **The CLI pins exact versions** in everything it generates (`src/cli/versions.ts` gets them from `build-constants.ts` via tsup `define`).
- **Always write `npx @githumbi/grabby …`, never `npx grabby`.** `grabby` on npm is an unrelated package from another maintainer.
- **Wrangler** is pinned in `packages/server/src/deploy/cloudflare.ts` (`WRANGLER_VERSION`, currently 4.135.0) and run through `npx` with install scripts off. Only move it to a version at least 7 days old, and re-test a real `share` deploy when you do.

**Releasing:**
1. Add a changeset to each PR that changes a published package.
2. After a merge, `release.yml` pushes `changeset-release/main`. Its "create PR" step fails because the repo doesn't let Actions open PRs (kept off on purpose; a PR opened with the workflow token wouldn't run CI anyway).
3. Open the "Version packages" PR from that branch by hand. Check the branch first with `gh api repos/githumbi/grabby/compare/main...changeset-release/main`: it should be 1 commit ahead and 0 behind.
4. Merging it publishes the new version. Afterwards, confirm it on npm (the registry can lag a few minutes; use `npm install --prefer-online`) and run `npm audit signatures`.
5. The repository doesn't allow auto-merge, so PRs are merged by hand, and only when the user says so.

**`main` is protected:**
- Changes only through a PR.
- Required checks: `test (20/22/24)`, `audit`, `analyze` and `workflow security (zizmor)`.
- The branch must be up to date and conversations resolved.
- Admins included; no force-push or deletion.

**README** (`README.md`, copied to `packages/grabby/README.md` at build):
- Structure: customer/stakeholder feedback first (intro, How it works, "Get feedback on your live site" step by step with `share`, Everyday tasks, Troubleshooting, own server, tag by hand), then What gets captured and Connect your AI agent, then **Developer mode** near the end, then framework, configuration and security reference. Keep that order: live feedback is the product's main use.
- Screenshots: 7 in `docs/images/`, linked by absolute `raw.githubusercontent.com/githumbi/grabby/main/docs/images/…` URLs so they also render on npm. They were captured from the running examples (React on :5181, plain-html `live.html` with the collector on :3456) by puppeteer-core driving Brave, headless with a throwaway profile, at 1200×640 and deviceScaleFactor 2. The script wasn't committed.

**GitHub About section:** the description, homepage (the npm page) and topics are set. The old `angular-grab.com` link is gone.

**Local testing:** `~/Documents/.claude/launch.json` has the examples plus:
- `grabby-collector`: the local server build on :3456 with demo keys `pk_demo_local_only` / `sk_demo_local_only_not_secret`. The live page is `http://localhost:5184/live.html?grabby=pk_demo_local_only`.
- `grabby-inbox-demo`: the same on :3457 with `GRABBY_PUBLIC_URL` set, for trying the inbox (get a link with `POST /v1/admin/inbox-token` and the demo admin token).
- `grabby-worker-dev`: the Worker bundle under `wrangler dev` on :8787, from a scratch `wrangler.json` (point it at a copy of `packages/server/dist/worker/worker.js`).

To try `share` from source before a release, set `GRABBY_SERVER_BIN` to `packages/server/dist/cli.js`. The tag it writes uses the current version number but hashes of your local build, so fix `data-integrity` to the CDN's hash if you deploy a site with it.

Verified in a browser: React, Vue, Svelte, Angular, plain HTML; live mode with two reviewers (named + anonymous) end to end through the collector, `pull` and MCP; Finish review with the collector going down and coming back; SRI against jsDelivr; strict CSP + Trusted Types with zero violations.

**Mobigrow portal** (`~/Documents/KCB work/Mobigrow/prototype`, repo `githumbi/mobigrow-portal`) uses Grabby via a vendored tarball (`vendor/githumbi-grabby-0.1.0-80950f4.tgz`). It could now switch to `@githumbi/grabby` from npm. **Don't change the Mobigrow project unless the user asks**; they reverted the last update there.

## Next steps

1. **Review the Dependabot major-update PRs one at a time.** None has been looked at yet:

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
   - Dismiss the by-design CodeQL alerts: `js/http-to-file-access` (`cli.ts` `--out`, and `share` saving the collector's reply) and `js/file-access-to-http` (the CLI sending the saved admin token to the project's own collector). Each is explained on PR #22.
   - Delete the merged `grabby-m1`…`grabby-m5`, `react-support` and old feature branches.
   - A README screenshot of the inbox (the images in `docs/images/` predate it).
   - A one-click "Deploy to Cloudflare" button, for people who'd rather not use the CLI.

Backlog: a reviewer deleting an already-sent comment doesn't delete it on the collector; Turbopack isn't supported; Svelte 4 line numbers are untested (only Svelte 5 was run); the Docker image wasn't built (daemon was off; its install steps were replayed locally); email alerts; `grabby login <inbox link>` so a teammate's machine can pull without `--rotate-admin`; a hosted MCP endpoint on the collector; tsup → tsdown migration.
