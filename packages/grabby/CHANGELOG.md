# @githumbi/grabby

## 0.2.1

### Patch Changes

- 0fa0419: `share` no longer fails with "could not create the inbox link (404)" right after setting up a new collector: it waits while the new Worker reaches all of Cloudflare's servers. It also saves its settings as soon as the collector exists, so if a later step fails, running `share` again just works instead of asking for `--rotate-admin`.
  
  `share` now also adds the script to Astro sites: the one layout in `src/layouts/` that renders `</body>`, as an `is:inline` tag so Astro leaves it as written.

## 0.2.0

### Minor Changes

- 27eec19: New `npx @githumbi/grabby share`: one command from nothing to a feedback link. It sets up a collector in your own free Cloudflare account (or connects one you run, with `--server`), adds the script to your site (including Next.js App Router layouts, automatically), and prints a link for reviewers and a private inbox link for you. Settings are saved in a gitignored `.grabby/config.json`, so re-running is safe and `npx @githumbi/grabby pull` needs no flags.
  
  Also new: `npx @githumbi/grabby inbox` opens the inbox, and `npx @githumbi/grabby alerts --slack <webhook>` posts new feedback to Slack.

### Patch Changes

- 27eec19: Unsent comments now keep retrying for 14 days instead of giving up after 20 attempts, so a collector that is down for a while doesn't cost reviewers their feedback.

## 0.1.2

### Patch Changes

- 561ab50: The CLI's help text and hints now say `npx @githumbi/grabby …` instead of `npx grabby …`. On npm, `grabby` is an unrelated package, so the short form only worked once Grabby was installed in the project.

## 0.1.1

### Patch Changes

- 4742695: Everything the CLI generates is now pinned to an exact version: the `.mcp.json` entry from `grabby add mcp` and `grabby pull` run one specific `@githumbi/grabby-server` release instead of any `0.x`, and the script tag printed by `grabby init` uses this exact version with Subresource Integrity hashes for the loader and the full build. Re-run `npx grabby add mcp` after upgrading to move the pin.

## 0.1.0

First release as Grabby (formerly angular-grab).

- Compact, kind-aware capture (action, field, text, media, container, section) with screenshots, instead of full outerHTML. Form values are never captured and text is redacted.
- Comments collect in a panel; **Copy all** offers compact, standard or detailed exports with a token estimate, then **Copy & clear** (with Undo) or **Copy, keep comments**.
- Adapters for React, Angular, Vue 2 and 3, Svelte 4 and 5 and plain HTML, detected per element; one build plugin for Vite, webpack, Rspack, Rollup, Rolldown and esbuild.
- Live-site mode: feedback links, commenter name or anonymous, a 500-byte loader, and delivery to `@githumbi/grabby-server` with retries.
- UI isolated in a shadow root, safe under CSP and Trusted Types. Default shortcut is Option/Alt+G.
