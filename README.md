# Grabby

**Point at any part of your UI, say what should change, and hand it to your AI coding agent.**

Grabby adds a small toolbar to your app. Click an element, type a comment, and Grabby records where that element lives in your code (component, `file:line`), what it is (a button, a form field, a card…), the few styles that matter, and a screenshot. Collect as many comments as you like, then **Copy all** and paste into Claude, Cursor, Copilot or ChatGPT, or let your agent read them directly over MCP.

It works on `localhost` while you build, and on your deployed site to collect feedback from clients, teammates or testers, with each comment tagged by who left it.

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

That's the whole export: no page dumps, around 150–300 tokens per comment.

- [Quick start](#quick-start)
- [Using it](#using-it)
- [What gets captured](#what-gets-captured)
- [Feedback on a live site](#feedback-on-a-live-site)
- [Connect your AI agent](#connect-your-ai-agent)
- [Framework support](#framework-support)
- [Configuration](#configuration)
- [Security and privacy](#security-and-privacy)

## Quick start

```bash
npx grabby init
```

`init` detects your framework, bundler and package manager, shows exactly which files it will change, and asks before touching anything. Or set it up by hand:

**React, Vue, Solid, Preact (Vite)**

```bash
pnpm add -D @githumbi/grabby
```

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

**Svelte / SvelteKit.** No plugin needed, since Svelte's dev build already records locations. Just call `initGrabby()`.

**Angular (17+)**

```ts
// app.config.ts
import { provideGrabby } from '@githumbi/grabby/angular';

export const appConfig: ApplicationConfig = {
  providers: [provideGrabby()],
};
```

In `angular.json`, swap the builders to `@githumbi/grabby:application` and `@githumbi/grabby:dev-server`. `npx grabby init` does both.

**Next.js**

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

**Any site, no build step**

```html
<script src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1.0/dist/grabby.global.js" defer></script>
```

## Using it

1. Press **Option+G** (Mac) or **Alt+G**, or click the hand icon, to enter selection mode.
2. Hover to see each element's component and file. Click one. Clicking an icon inside a button selects the button; hold **Shift** to pick the exact inner element.
3. Type what should change and press **Enter**. Grabby saves it with a screenshot. Nothing is copied yet.
4. Keep going. The badge counts your comments; the list shows them with thumbnails. Click one to edit it.
5. **Copy all** opens a preview. Choose a detail level, edit the text if you like, then:
   - **Copy & clear**: copy, and start fresh next time (with Undo, in case).
   - **Copy, keep comments**: copy and keep them.

| Key | |
|---|---|
| Option+G / Alt+G | Toggle selection mode |
| F | Freeze the page while selecting, to grab menus, tooltips and hover states |
| Enter / Shift+Enter | Save comment / new line |
| Esc | Cancel, close the panel, or leave selection mode |
| ⌘/Ctrl+Enter | Copy & clear, in the Copy dialog |

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

## Feedback on a live site

Collect comments from clients, stakeholders or testers on your deployed site. Ordinary visitors see nothing; reviewers open a feedback link.

**1. Run a collector.** It's small, has no database or native dependencies, and runs anywhere Node 20 or Docker does.

```bash
npx @githumbi/grabby-server init --origin https://your-site.com
npx @githumbi/grabby-server start --public
```

`init` prints a **project key** (public, goes in your site) and an **admin token** (secret, for you). To deploy with Docker, Fly.io, Render or Railway, see [packages/server](packages/server/README.md).

**2. Add Grabby to the site.** The loader is under 500 bytes gzipped and fetches the rest only for reviewers:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1.0/dist/loader.global.js"
  data-mode="live"
  data-server="https://feedback.your-site.com"
  data-project-key="pk_…"
  defer
></script>
```

Pin an exact version. To guard against a compromised CDN, add Subresource Integrity: `integrity` and `crossorigin="anonymous"` on the loader tag cover the loader, and `data-integrity` covers the full build it fetches. jsDelivr shows both hashes on the package's file pages.

or with a bundler:

```ts
import { initGrabbyLive } from '@githumbi/grabby/live';

initGrabbyLive({ server: 'https://feedback.your-site.com', projectKey: 'pk_…' });
```

**3. Share the feedback link:** `https://your-site.com/?grabby=pk_…`

Reviewers get a **Comment** button and a short three-step tip. After their first comment, Grabby asks who it's from: a name, or **Post anonymously**. The choice is remembered, and anonymous reviewers still get a stable id, so you can tell "Anonymous 3f9a" from "Anonymous b21c". If your app already knows who's signed in, skip the question with `grabby.identify({ id, name })`. Comments are saved in the browser first and retried until they reach your collector, so a bad connection doesn't lose them. Reviewers leave feedback mode with ✕.

**4. Pull the feedback into your agent:**

```bash
npx @githumbi/grabby-server pull --server https://feedback.your-site.com --token sk_…
```

This prints every open comment, grouped by file and labelled by author, and saves the screenshots to `./.grabby/screenshots/` where your agent can open them. The comments are then marked resolved, so the next pull shows only new feedback. Use `--keep` to leave them open or `--delete` to remove them.

## Connect your AI agent

- **Copy all**: paste into any chat or agent.
- **MCP**: run `npx grabby add mcp`. Your agent gets `grabby_list_comments`, `grabby_get_comment` (with the screenshot), `grabby_resolve` and `grabby_stats`. Locally it also collects comments: set `initGrabby({ server: 'http://localhost:3456' })`. Against a deployed collector, add `--server <url> --token <sk_…>` to the MCP command.
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
