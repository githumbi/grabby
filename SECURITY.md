# Security policy

## Reporting a vulnerability

Please **don't open a public issue**. Report privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting).

Include what you found, how to reproduce it, and the impact you see. You'll get an acknowledgement within 3 working days and a plan within 10. Fixes are released as soon as they're ready, with credit if you'd like it.

## Supported versions

The latest minor release of `@githumbi/grabby` and `@githumbi/grabby-server` receives security fixes.

## Scope

Especially interesting:

- Script injection through comments, component names, file paths or anything else rendered in Grabby's UI or exports.
- Capture of data it promises not to capture (form values, hidden inputs, credentials, tokens in URLs).
- Bypassing the collector's key, origin, session or admin-token checks; reading or deleting other people's comments.
- DNS rebinding or cross-site access to a local collector.
- Getting at the inbox without its link, using the inbox token for admin actions, or leaking the token (to logs, Referer headers, other sites).
- Making the collector's alerts post somewhere the owner didn't choose, or mention people in Slack.
- Anything in the published packages that runs code you didn't ask for.

Out of scope: denial of service by volume against a collector, including using up a Cloudflare free plan's daily quota (put it behind your platform's rate limiting), and issues that need an already-compromised browser or machine.

## How releases are protected

Packages are published from GitHub Actions with npm trusted publishing (OIDC) and provenance; there are no long-lived npm tokens. You can verify a release with `npm audit signatures`.

The repository is set up against the attacks behind the 2025–2026 npm worms (Shai-Hulud, the axios and TanStack compromises and others), which spread through dependency install scripts, freshly hijacked releases, moved GitHub Action tags and poisoned CI caches:

- **Installs** (`pnpm-workspace.yaml`): no dependency may run install scripts; versions published less than 7 days ago aren't installed; a release that lost the provenance or trusted publishing its earlier versions had is refused; transitive dependencies can't come from git or URLs.
- **GitHub Actions**: every action is pinned to a full commit SHA; workflows start with no permissions and each job asks for the minimum; checkouts don't keep credentials; workflows are scanned with zizmor on every PR; `main` only changes through PRs that pass CI.
- **Releases** (`release.yml`): the build and tests run in a job that can't publish. The publish job receives the built files, restores no caches, and is the only one allowed an npm OIDC token.
- **Dependabot** waits 7 days before proposing a new version (30 for majors), and major updates come as separate PRs.
- **For users**: the packages have no install scripts, and everything Grabby writes for you (MCP config, `pull`, CDN tags) is pinned to an exact version, with integrity hashes for script tags. `grabby share` deploys the prebuilt `dist/worker/worker.js` from the published `@githumbi/grabby-server` as-is (`wrangler deploy --no-bundle`), so the code running in your Cloudflare account is the file npm published with provenance. It runs Wrangler at a pinned version at least 7 days old, through `npx` with install scripts turned off, and passes the admin token to Cloudflare in a temporary owner-only file rather than on the command line.
