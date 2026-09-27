# Grabby

**Let your customers and stakeholders comment on your live website, and hand their feedback straight to your AI coding agent.**

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-welcome.png" alt="A live site opened with a Grabby feedback link: a short tip explains Comment, click, type, and the toolbar shows a Comment button" width="820"></p>

Send a client, tester or stakeholder a link to your site. They click **Comment**, click anything on the page, and type what should change. No account, no install. Every comment arrives with a screenshot, who left it, the page, and where that element lives in your code (component and `file:line`). You read it all in a private inbox, get a Slack message when new feedback comes in, and pass it to Claude, Cursor, Copilot or ChatGPT with one click, or let your agent read it directly.

Setting it up is one command, and it works with Next.js, Astro, React, Vue, Svelte, Angular and plain HTML sites, wherever they're hosted.

- [Get feedback on your live site](#get-feedback-on-your-live-site): step by step
- [Read and act on feedback](#4-read-the-feedback)
- [Troubleshooting](#troubleshooting)
- [What gets captured](#what-gets-captured)
- [Connect your AI agent](#connect-your-ai-agent)
- [Developer mode: comment on your own app while you build](#developer-mode-comment-on-your-own-app-while-you-build)
- [Framework support](#framework-support) · [Configuration](#configuration) · [Security and privacy](#security-and-privacy)

## How it works

```text
 Reviewer on your site  ──comment + screenshot──▶  Collector in your Cloudflare account
 (?grabby= link)                                    (free, always on, permanent address)
                                                            │
                           ┌────────────────────────────────┼──────────────────────────┐
                           ▼                                ▼                          ▼
                    Your private inbox               Your AI agent               Slack (optional)
                    (web page, any device)           (pull or MCP)
```

- **Visitors see nothing.** The script is a loader under 500 bytes. The toolbar only appears for someone who opens your feedback link.
- **Feedback keeps arriving while your computer is off.** The collector runs in your own Cloudflare account, on the free plan, and the comments stay there.
- **You never touch servers or keys.** `npx @githumbi/grabby share` sets up the collector, edits your site, and saves the settings.

## Get feedback on your live site

### Before you start

- **Node.js 20 or newer** on your computer (`node -v` shows your version).
- **Your site's project folder**, and a way to deploy it (Netlify, Vercel, GitHub Pages, your own server… anything works).
- **A free Cloudflare account.** You don't need one beforehand: the first time, setup opens the sign-up page for you. No credit card.

### 1. Run one command in your project folder

```bash
npx @githumbi/grabby share
```

It asks for your site's address once (for example `https://my-app.netlify.app`), shows what it's about to do, and asks you to confirm. Then:

1. **The first time only, a browser window opens to sign in to Cloudflare.** Sign in (or create a free account) and click **Allow**. You can close that tab afterwards.
2. **The first time only, if your Cloudflare account is new, the terminal asks you to pick a `workers.dev` subdomain.** Answer `Y` and type a name, such as your name or company. It becomes part of your collector's address: `https://grabby-my-app.<your-name>.workers.dev`.
3. **It sets up the collector** in your Cloudflare account. This takes about 30 seconds.
4. **It adds the Grabby script to your site**: `app/layout.tsx` (or `src/app/layout.tsx`) in Next.js, the layout in `src/layouts/` in Astro, `index.html` in Vite, Angular, SvelteKit and plain HTML sites. If it can't find the right file, it prints the tag for you to paste before `</body>`.
5. **It saves its settings** in `.grabby/config.json`, which is private and added to `.gitignore`, and lets your AI agent read feedback through `.mcp.json`.

It finishes with everything you need:

```text
[grabby] Grabby is ready.

  1. Commit and deploy your site as usual (app/layout.tsx changed).
  2. Send reviewers this link. They click Comment, pick anything, and type:
       https://my-app.netlify.app/?grabby=pk_…
  3. Read feedback in your private inbox (bookmark it; don't share it):
       https://grabby-my-app.you.workers.dev/inbox#k=ik_…
     or hand it to your AI agent: npx @githumbi/grabby pull
```

### 2. Deploy your site

Commit the changed files and deploy as you normally do:

```bash
git add . && git commit -m "Add Grabby feedback" && git push
```

That's the last time you need to change your site for Grabby.

### 3. Send reviewers the feedback link

It's your site's address with `?grabby=` and your project key on the end. `share` prints it. Any page works, so you can send people straight to the screen you want feedback on:

```text
https://my-app.netlify.app/pricing?grabby=pk_…
```

Reviewers get a **Comment** button and a short three-step tip. As they move the pointer, Grabby names what's under it in plain words, such as `Button "Start free trial" · Click to select` or `Card "Your plan"`, so nobody needs to know HTML:

1. Click **Comment**.
2. Click the part of the page they want to talk about.
3. Type what should change and press **Enter**.

After their first comment, Grabby asks who it's from: a name, or **Post anonymously**. The choice is remembered, and anonymous reviewers still get a stable id, so you can tell "Anonymous 3f9a" from "Anonymous b21c". If your app already knows who's signed in, skip the question with `grabby.identify({ id, name })`.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-identity.png" alt="After a comment, Grabby asks: Thanks! Who is this from? with a name field, Post anonymously and Post" width="820"></p>

Each comment is sent as soon as it's saved. It's kept in the reviewer's browser first and retried for up to two weeks, so a bad connection doesn't lose it, and closing the tab with an unsent comment brings up the browser's "Leave site?" prompt. When they're done, **Finish review** shows what reached you; **Done** clears their list for another round.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-finish.png" alt="The Finish review summary: Your comment was sent to the team, with Keep reviewing and Done; the toolbar shows 1 sent" width="820"></p>

### 4. Read the feedback

**In your inbox.** Open the private link from `share` (or run `npx @githumbi/grabby inbox`). You'll see every comment with:

- its screenshot (click to enlarge),
- who left it, the page and when,
- the element and where it lives in your code, such as `PlanCard` in `src/PlanCard.tsx:15`.

Mark comments **resolved** once they're handled, **delete** them, or click **Copy all for AI** and paste the result into your AI agent. The inbox works on any device, including your phone. Treat the link like a password: anyone with it can read the feedback.

**In your AI agent.** Run:

```bash
npx @githumbi/grabby pull
```

It prints every open comment, grouped by file and labelled by author, saves the screenshots to `./.grabby/screenshots/` where your agent can open them, and marks the comments resolved so the next pull only shows new feedback (add `--keep` to leave them open):

```text
3. Make this button green so it matches our brand
   - `<button class="cta">Start free trial</button>` (action) Hero
   - styles: bg #111827 · color #fff · size 16px · weight 600 · padding 14px 22px · radius 10px
   - screenshot: .grabby/screenshots/9c1f….webp
   - by Amina (client)
```

Or skip the copy and paste: `share` set up MCP, so after restarting your editor you can ask your agent to "fix the open Grabby comments".

**In Slack.** Create an [incoming webhook](https://api.slack.com/messaging/webhooks) for a channel, then:

```bash
npx @githumbi/grabby alerts --slack https://hooks.slack.com/services/…
```

New feedback is posted within about 20 seconds, one message per burst, each with a link to the comment in your inbox. `--test` sends a test message, `--webhook <url>` sends JSON to any other service, and `--off` stops alerts.

### Everyday tasks

| To… | Run |
|---|---|
| Open your inbox | `npx @githumbi/grabby inbox` |
| Get open comments for your AI agent | `npx @githumbi/grabby pull` |
| Accept feedback from another address (staging, custom domain) | `npx @githumbi/grabby share --origin https://staging.my-app.com` |
| Replace the inbox link (if it was shared by mistake) | `npx @githumbi/grabby share --rotate` |
| Update the collector after upgrading Grabby | `npx @githumbi/grabby share` |
| Turn Slack alerts on or off | `npx @githumbi/grabby alerts --slack <webhook>` / `--off` |
| Set up on a new computer (the settings aren't in git) | `npx @githumbi/grabby share --rotate-admin` |

Running `share` again is always safe: it keeps your feedback link, your inbox link and your comments.

### Troubleshooting

- **Reviewers see "not sent".** The site can't reach the collector. Check that your latest deploy includes the Grabby script, and that the address in the browser matches the one you gave `share`. Staging sites and custom domains each need adding: `share --origin <address>`. Unsent comments are retried for two weeks, so they arrive once it's fixed.
- **No Comment button appears.** Make sure the link ends in `?grabby=` followed by the key `share` printed, and that the deployed page contains the Grabby `<script>`.
- **The Cloudflare sign-in didn't open, or you're on a server without a browser.** Create an API token in the Cloudflare dashboard and run `share` with `CLOUDFLARE_API_TOKEN=… npx @githumbi/grabby share`. If you belong to several Cloudflare accounts, also set `CLOUDFLARE_ACCOUNT_ID`.
- **A company network blocks `*.workers.dev`.** Some corporate networks do. Test from another network, or [run the collector on your own server](#run-the-collector-on-your-own-server-instead) under your company's domain.
- **`share` couldn't find where to add the script.** It prints the tag instead; see [Adding the script by hand](#adding-the-script-by-hand).

### Run the collector on your own server instead

Prefer not to use Cloudflare? The collector is also a small Node server with no database. Run it anywhere Node 20 or Docker runs, behind HTTPS:

```bash
npx -y @githumbi/grabby-server init --origin https://my-app.com     # prints a project key and an admin token
GRABBY_PUBLIC_KEY=pk_… GRABBY_ADMIN_TOKEN=sk_… GRABBY_ALLOWED_ORIGINS=https://my-app.com \
  GRABBY_PUBLIC_URL=https://feedback.my-app.com npx -y @githumbi/grabby-server start --public
```

Then connect your project to it. This adds the script, the inbox link and the settings, the same as above:

```bash
npx @githumbi/grabby share --server https://feedback.my-app.com --token sk_…
```

Docker and other options are in [packages/server](packages/server/README.md).

### Adding the script by hand

`share` prints this tag with your address, key and integrity hashes filled in. Put it before `</body>`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@<version>/dist/loader.global.js"
  integrity="sha384-…" crossorigin="anonymous" data-integrity="sha384-…"
  data-mode="live"
  data-server="https://grabby-my-app.you.workers.dev"
  data-project-key="pk_…"
  defer
></script>
```

In a Next.js App Router layout, use `<Script … strategy="afterInteractive" />` from `next/script` with the same attributes (`crossOrigin` in JSX). With a bundler you can instead install `@githumbi/grabby` and call `initGrabbyLive({ server, projectKey })` from `@githumbi/grabby/live`.

## What gets captured

Grabby looks at *what kind* of element you clicked and keeps only what matters for it:

| Kind | Captured |
|---|---|
| **Action**: button, link, tab | label, href path, state (disabled, expanded, selected), custom styles |
| **Form field** | label, type, placeholder, required/invalid. **Never the value.** |
| **Text** | text (up to 120 chars), font size, weight, colour, line height |
| **Media** | alt text (or that it's missing), file name, rendered vs natural size |
| **Container / card** | heading, a summary of what's inside ("heading, 3× PlanCard, button"), layout styles |
| **Page section** | page title, viewport, regions and components on the page. No HTML. |

Every comment also carries the component, source file and line, up to three of *your* components above it (library frames are skipped), a trimmed HTML preview capped at 300 characters, and a screenshot. Styles are compared against browser defaults, so only the values your code set are reported.

The export names the page once, groups comments by file, and skips anything already visible in the preview. **Compact** is one line per comment; **Detailed** adds ancestors, position and all custom styles for tricky layout bugs. Twenty mixed comments fit comfortably under 6k tokens at the default level.

Screenshots are never pasted into the text; they'd crowd out the context window. They stay in the browser (and on your collector, if you use one), and `pull` and MCP give your agent the image file.

## Connect your AI agent

- **Copy all**: paste into any chat or agent.
- **MCP**: run `npx @githumbi/grabby add mcp` (`share` does this for you). Your agent gets `grabby_list_comments`, `grabby_get_comment` (with the screenshot), `grabby_resolve` and `grabby_stats`. After `share`, it reads your live site's feedback; otherwise it also collects comments locally: set `initGrabby({ server: 'http://localhost:3456' })`.
- **`pull`**: prints the same export as Copy all, for scripts and terminal agents.
- **Inbox**: the private web page from `share`, with **Copy all for AI**.

## Developer mode: comment on your own app while you build

The same toolbar also works on your local dev server, for you and your team. Comments stay in your browser and go straight to your AI agent, with exact source locations from a small build plugin. Nothing is added to production builds.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/dev-hover.png" alt="Hovering a button in selection mode: Grabby labels it "button .btn in PlanCard, src/PlanCard.tsx:15"" width="820"></p>

### 1. Install for development

You need Node 20 or newer. In your project folder, run:

```bash
npx @githumbi/grabby init
```

`init` detects your framework, bundler and package manager, shows exactly which files it will change, and asks before touching anything. Add `--dry-run` to only see the plan.

Prefer to set it up by hand? Install the package as a dev dependency:

```bash
npm install -D @githumbi/grabby    # or: pnpm add -D @githumbi/grabby · yarn add -D @githumbi/grabby
```

then follow the steps for your stack:

<details>
<summary><strong>React, Vue, Solid, Preact (Vite)</strong></summary>

```ts
// vite.config.ts
import grabby from '@githumbi/grabby/plugin';

export default defineConfig({
  plugins: [grabby.vite(), react()], // grabby first
});
```

```ts
// src/main.tsx (or main.ts)
import { initGrabby } from '@githumbi/grabby';

if (import.meta.env.DEV) initGrabby();
```

The plugin adds `file:line:col` to every element in development only. Production builds contain neither the stamps nor Grabby. Using webpack, Rspack, Rollup or esbuild? Use `grabby.webpack()`, `grabby.rspack()`, and so on.
</details>

<details>
<summary><strong>Svelte / SvelteKit</strong></summary>

No plugin needed, since Svelte's dev build already records locations. Just call `initGrabby()` in development:

```ts
import { initGrabby } from '@githumbi/grabby';

if (import.meta.env.DEV) initGrabby();
```
</details>

<details>
<summary><strong>Angular (17+)</strong></summary>

```ts
// app.config.ts
import { provideGrabby } from '@githumbi/grabby/angular';

export const appConfig: ApplicationConfig = {
  providers: [provideGrabby()],
};
```

In `angular.json`, swap the builders to `@githumbi/grabby:application` and `@githumbi/grabby:dev-server`. `npx @githumbi/grabby init` does both.
</details>

<details>
<summary><strong>Next.js</strong></summary>

```js
// next.config.js
const grabby = require('@githumbi/grabby/plugin').default;
module.exports = { webpack: (config) => { config.plugins.unshift(grabby.webpack()); return config; } };
```

```tsx
// a client component in your root layout
'use client';
useEffect(() => {
  if (process.env.NODE_ENV === 'development') import('@githumbi/grabby').then((g) => g.initGrabby());
}, []);
```
</details>

<details>
<summary><strong>Any site, no build step</strong></summary>

```html
<script src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@<version>/dist/grabby.global.js" defer></script>
```

Use an exact version, never a range. Running `npx @githumbi/grabby init --dry-run` in an empty folder prints this tag with the current version and an `integrity` hash, so a tampered CDN copy won't run.
</details>

Start your dev server as usual. The Grabby toolbar appears the first time you press the shortcut.

### 2. Leave comments

1. Press **Option+G** (Mac) or **Alt+G** (Windows, Linux), or click the hand icon, to enter selection mode.
2. Hover: every element shows its component and source file, like the picture at the top. Click the one you want to change. Clicking an icon inside a button selects the button; hold **Shift** to pick the exact inner element.
3. Type what should change and press **Enter**. Grabby saves it with a screenshot.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/dev-comment.png" alt="The comment box open next to the Choose Pro button, with a comment typed in" width="820"></p>

4. Keep going. The badge on the clock icon counts your comments, and the list shows them with thumbnails, their kind and file. Click one to edit it.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/dev-comments.png" alt="The comments list with two comments, each with a thumbnail, its kind (action, field) and source file" width="820"></p>

### 3. Hand them to your agent

**Copy all** opens a preview of exactly what your agent will get. Pick a detail level, edit the text if you like, then **Copy & clear** (with Undo, just in case) or **Copy, keep comments**, and paste it into your agent.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/dev-copy-all.png" alt="The Copy all preview: Compact, Standard and Detailed levels, the export text and a token estimate" width="820"></p>

```text
# UI feedback · 2 comments
localhost:5173 · React · page /pricing · 1440×900 · 2026-09-26

## src/components/PlanCard.tsx · PlanCard
1. Highlight the Pro plan button
   - `<button class="btn">Choose Pro</button>` (action) line 15
   - styles: bg #2563eb · color #fff · weight 600 · padding 10px 14px · radius 8px
   - inside: App (App.tsx:11)
2. Stack the cards vertically on mobile
   - `<article class="card">(4 elements)</article>` (container) line 9
   - heading: Starter · contains: heading, p, list, button · size: 225×234
   - layout: padding 20px · bg #fff · radius 12px · border 1px solid #e2e8f0
```

That's the whole export: no page dumps, around 150–300 tokens per comment. To skip copy and paste, let your agent read comments directly: see [Connect your AI agent](#connect-your-ai-agent).

| Key | |
|---|---|
| Option+G / Alt+G | Toggle selection mode |
| F | Freeze the page while selecting, to grab menus, tooltips and hover states |
| Enter / Shift+Enter | Save comment / new line |
| Esc | Cancel, close the panel, or leave selection mode |
| ⌘/Ctrl+Enter | Copy & clear, in the Copy dialog |

## Framework support

| Stack | Component names | Source location | Setup |
|---|---|---|---|
| React (incl. 19), Preact, Solid | fiber (React), plugin stamps | exact `file:line:col` | build plugin |
| Vue 3 and 2 | component instance | exact line (plugin), or file | build plugin |
| Svelte 4 and 5 | from file | exact `file:line:col` | none |
| Angular 17+ | `ng` debug API | component file and line | builders |
| Anything else, plain HTML | `data-component="Name"` | unique CSS selector | none |

Grabby tries each adapter per element, so it copes with apps that mount late and pages that mix frameworks. You can write your own adapter; see `FrameworkAdapter` in the types.

## Configuration

```ts
initGrabby({
  activationKey: 'Alt+G',     // shortcut; 'toggle' or 'hold' via activationMode
  detailLevel: 'standard',    // default for Copy all: 'compact' | 'standard' | 'detailed'
  copyOnComment: false,       // also copy each comment as soon as it's saved
  screenshots: true,
  captureQueryParams: [],     // query params worth keeping in the page route, e.g. ['tab']
  persistHistory: true,       // keep comments across reloads (localStorage)

  mode: 'local',              // 'live' for deployed sites (see above)
  server: undefined,          // collector URL
  projectKey: undefined,      // public project key (live)
  identity: undefined,        // 'ask' | 'anonymous' | 'none'; defaults: 'ask' live, 'none' local
  webhookUrl: undefined,      // also POST each comment as JSON (https or localhost only)

  devOnly: true,              // local mode is a no-op in production builds
  styleNonce: undefined,      // CSP nonce, for browsers without constructable stylesheets
});
```

The API: `activate()`, `deactivate()`, `toggle()`, `show()`, `hide()`, `getComments()`, `exportComments({ level, ids })`, `deleteComment(id)`, `clearComments()`, `identify(user)`, `registerPlugin(plugin)`, `dispose()`. Plugins can hook `onComment`, `onScreenshot`, `onCopySuccess`, `transformCopyContent` and more.

Mark parts of your page:

- `data-grabby-ignore`: can't be selected and is left out of screenshots.
- `data-grabby-mask`: its text is replaced by `[masked]` and it's blurred in screenshots. Use it for account numbers, personal data, anything sensitive.
- `data-component="Checkout"`: names a component on plain-HTML pages.

## Security and privacy

- **Form values are never captured.** Neither are hidden inputs, inline event handlers or inline styles. Captured text is scrubbed of email addresses, long numbers (cards, accounts), JWTs and bearer tokens, and routes drop their query string and token-bearing hashes unless you allow a parameter.
- **The UI is isolated** in a shadow root and built without `innerHTML`, so page CSS can't break it and nothing a user types can run as code. It works under strict CSP (`style-src 'self'`) and Trusted Types.
- **The collector** stays on localhost unless started with `--public` (or deployed to Cloudflare), and then refuses to work without an admin token, a project key and a list of allowed sites. The public key can only add comments; reading, resolving and deleting need the admin token or the inbox link. Input is validated and size-capped, screenshots are checked by their bytes, only the browser that wrote a comment can attach its screenshot, and requests are rate-limited. Locally, it rejects DNS-rebinding attempts.
- **The inbox link** carries its token after `#`, which browsers never send to servers or in Referer headers; the page moves it out of the address bar at once. The token can read and resolve comments but not change settings, and `share --rotate` revokes it. The inbox page is built without `innerHTML` and served with a strict Content-Security-Policy. `.grabby/config.json` holds the admin token: it's owner-only and gitignored, and never written to `.mcp.json`.
- **Comments are user input.** MCP results tell your agent to treat them as data, not instructions. Review what an agent does with feedback from people you don't know.
- **Supply chain.** Neither package has install scripts. Everything Grabby generates for you is pinned to an exact version: the `.mcp.json` entry and `grabby pull` run one specific `@githumbi/grabby-server` release (re-run `npx @githumbi/grabby add mcp` after upgrading to move it), the CDN tag from `share` and `init` carries integrity hashes, and `share` deploys the exact Worker file published to npm, using a pinned Wrangler with install scripts off. Releases are built in CI and published with npm trusted publishing and provenance; see [SECURITY.md](SECURITY.md#how-releases-are-protected) for how the repository itself is hardened.

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Packages

| | |
|---|---|
| [`@githumbi/grabby`](packages/grabby) | The toolbar, framework adapters, build plugin, CLI |
| [`@githumbi/grabby-server`](packages/server) | The collector (Cloudflare Worker or Node), inbox, alerts, MCP server, `pull` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The [examples](examples) folder has a small app for each framework.

## Credits

Grabby began as a fork of angular-grab by Nate Richardson. The freeze mode follows techniques from [react-grab](https://github.com/aidenybai/react-grab), and screenshots use [modern-screenshot](https://github.com/qq15725/modern-screenshot).

## License

MIT
