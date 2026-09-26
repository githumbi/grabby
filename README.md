# Grabby

**Point at any part of your UI, say what should change, and hand it to your AI coding agent.**

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/dev-hover.png" alt="Hovering a button in selection mode: Grabby labels it "button .btn in PlanCard, src/PlanCard.tsx:15"" width="820"></p>

Grabby adds a small toolbar to your app. Click an element, type a comment, and Grabby records where that element lives in your code (component, `file:line`), what it is (a button, a form field, a card…), the few styles that matter, and a screenshot. Collect as many comments as you like, then **Copy all** and paste into Claude, Cursor, Copilot or ChatGPT, or let your agent read them directly over MCP.

## Two ways to use it

| | **Developer mode** | **Live feedback** |
|---|---|---|
| Who comments | You (and your team) while building | Clients, testers, stakeholders |
| Where | Your local dev server | Your deployed site (production or staging) |
| What visitors see | Nothing: it's left out of production builds | Nothing, unless they open your feedback link |
| Where comments go | Your browser, then **Copy all** or your agent (MCP) | A small collector you host, then `pull` or MCP |
| Setup | [Install the package](#developer-mode) | [Run a collector and add one script tag](#live-feedback-on-your-deployed-site) |

You can use both: developer mode day to day, live feedback when someone else needs to review.

- [Developer mode](#developer-mode)
- [Live feedback on your deployed site](#live-feedback-on-your-deployed-site)
- [What gets captured](#what-gets-captured)
- [Connect your AI agent](#connect-your-ai-agent)
- [Framework support](#framework-support)
- [Configuration](#configuration)
- [Security and privacy](#security-and-privacy)

## Developer mode

### 1. Install

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
<script src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1.1/dist/grabby.global.js" defer></script>
```

Use an exact version, as above. Running `npx @githumbi/grabby init --dry-run` in an empty folder prints this tag with an `integrity` hash, so a tampered CDN copy won't run.
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

## Live feedback on your deployed site

Collect comments from clients, stakeholders or testers on your real site. Ordinary visitors see nothing and download almost nothing (a loader under 500 bytes). Reviewers open a feedback link, and every comment arrives tagged with who left it.

You'll set up two things: a small **collector** that receives comments, and one **script tag** on your site.

### 1. Run a collector

The collector is a small Node server with no database and no native dependencies. It runs anywhere Node 20 or Docker does: your own server, Fly.io, Render, Railway…

```bash
npx -y @githumbi/grabby-server@0.1.0 init --origin https://your-site.com
npx -y @githumbi/grabby-server@0.1.0 start --public
```

`init` prints two values. Keep them:

- a **project key** (`pk_…`): public, it goes into your site;
- an **admin token** (`sk_…`): secret, only for you and your agent.

Put the collector behind HTTPS (for example `https://feedback.your-site.com`). Deployment guides for Docker, Fly.io, Render and Railway are in [packages/server](packages/server/README.md).

### 2. Add Grabby to your site

Add this before `</body>`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1.1/dist/loader.global.js"
  data-mode="live"
  data-server="https://feedback.your-site.com"
  data-project-key="pk_…"
  defer
></script>
```

For production, also add integrity hashes so a tampered CDN copy can't run. Run `npx @githumbi/grabby init --live --server https://feedback.your-site.com --key pk_… --dry-run` in an empty folder, and it prints this tag with `integrity` (for the loader) and `data-integrity` (for the full build it fetches) filled in. Always use an exact version, never a range like `@0.1`.

Using a bundler instead? Install `@githumbi/grabby` as a normal dependency and call:

```ts
import { initGrabbyLive } from '@githumbi/grabby/live';

initGrabbyLive({ server: 'https://feedback.your-site.com', projectKey: 'pk_…' });
```

### 3. Share the feedback link

Send reviewers your page with `?grabby=` and your project key:

```text
https://your-site.com/?grabby=pk_…
```

They get a **Comment** button and a short three-step tip. No account or install needed.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-welcome.png" alt="A live site opened with the feedback link: the tip explains Comment, click, type, and the toolbar shows a Comment button" width="820"></p>

After their first comment, Grabby asks who it's from: a name, or **Post anonymously**. The choice is remembered, and anonymous reviewers still get a stable id, so you can tell "Anonymous 3f9a" from "Anonymous b21c". If your app already knows who's signed in, skip the question with `grabby.identify({ id, name })`.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-identity.png" alt="After a comment, Grabby asks: Thanks! Who is this from? with a name field, Post anonymously and Post" width="820"></p>

Each comment is sent as soon as it's saved. It's kept in the browser first and retried until it reaches your collector, so a bad connection doesn't lose it, and closing the tab with a half-typed or unsent comment brings up the browser's "Leave site?" prompt. The toolbar shows how many were sent. When reviewers are done, **Finish review** shows what reached you; **Done** clears their list for another round.

<p align="center"><img src="https://raw.githubusercontent.com/githumbi/grabby/main/docs/images/live-finish.png" alt="The Finish review summary: Your comment was sent to the team, with Keep reviewing and Done; the toolbar shows 1 sent" width="820"></p>

### 4. Pull the feedback into your agent

```bash
npx -y @githumbi/grabby-server@0.1.0 pull --server https://feedback.your-site.com --token sk_…
```

This prints every open comment, grouped by file and labelled by author, and saves the screenshots to `./.grabby/screenshots/` where your agent can open them:

```text
3. Make this button green so it matches our brand
   - `<button class="cta">Start free trial</button>` (action) Hero
   - styles: bg #111827 · color #fff · size 16px · weight 600 · padding 14px 22px · radius 10px
   - screenshot: .grabby/screenshots/9c1f….webp
   - by Amina (client)
```

The comments are then marked resolved, so the next pull shows only new feedback. Use `--keep` to leave them open or `--delete` to remove them. Or give your agent the collector over MCP (next section) and ask it to "fix the open Grabby comments".

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
- **MCP**: run `npx @githumbi/grabby add mcp`. Your agent gets `grabby_list_comments`, `grabby_get_comment` (with the screenshot), `grabby_resolve` and `grabby_stats`. Locally it also collects comments: set `initGrabby({ server: 'http://localhost:3456' })`. Against a deployed collector, add `--server <url> --token <sk_…>` to the MCP command.
- **`pull`**: prints the same export as Copy all, for scripts and terminal agents.

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
- **The collector** stays on localhost unless started with `--public`, and then refuses to start without an admin token, a project key and a list of allowed sites. The public key can only add comments; reading, resolving and deleting need the admin token. Input is validated and size-capped, screenshots are checked by their bytes, only the browser that wrote a comment can attach its screenshot, and requests are rate-limited. Locally, it rejects DNS-rebinding attempts.
- **Comments are user input.** MCP results tell your agent to treat them as data, not instructions. Review what an agent does with feedback from people you don't know.
- **Supply chain.** Neither package has install scripts. Everything Grabby generates for you is pinned to an exact version: the `.mcp.json` entry and `grabby pull` run one specific `@githumbi/grabby-server` release (re-run `npx @githumbi/grabby add mcp` after upgrading to move it), and the CDN tag from `@githumbi/grabby init` carries integrity hashes. Releases are built in CI and published with npm trusted publishing and provenance; see [SECURITY.md](SECURITY.md#how-releases-are-protected) for how the repository itself is hardened.

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## Packages

| | |
|---|---|
| [`@githumbi/grabby`](packages/grabby) | The toolbar, framework adapters, build plugin, CLI |
| [`@githumbi/grabby-server`](packages/server) | Self-hosted collector, MCP server, `pull` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The [examples](examples) folder has a small app for each framework.

## Credits

Grabby began as a fork of angular-grab by Nate Richardson. The freeze mode follows techniques from [react-grab](https://github.com/aidenybai/react-grab), and screenshots use [modern-screenshot](https://github.com/qq15725/modern-screenshot).

## License

MIT
