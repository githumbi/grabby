# grabby

> Grab any element in your Angular or React app and give it to AI coding agents

Point at any element and press **Cmd+C** (Mac) or **Ctrl+C** (Windows/Linux) to copy the component name, file path, and HTML source code to your clipboard. Paste it into Claude, ChatGPT, Copilot, or any AI coding agent for instant context.

## Install

```bash
npx @githumbi/grabby init
```

Or manually:

```bash
npm install @githumbi/grabby
```

Then add the provider to your app config:

```typescript
import { provideGrabby } from '@githumbi/grabby/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideGrabby(),
  ],
};
```

And update `angular.json` to use the grabby builders:

```json
{
  "architect": {
    "build": {
      "builder": "@githumbi/grabby:application"
    },
    "serve": {
      "builder": "@githumbi/grabby:dev-server"
    }
  }
}
```

### React

The picker, toolbar, comments and history are framework-agnostic, so React apps
use the same engine with a React resolver. Component names come from the React
fiber; file paths come from a Vite plugin that stamps each JSX element with its
source location.

```typescript
// vite.config.ts — the stamper must run before the react plugin
import { grabbyReactVitePlugin } from '@githumbi/grabby/vite-react';

export default defineConfig({
  plugins: [
    grabbyReactVitePlugin({ rootDir: import.meta.dirname }),
    react(),
  ],
});
```

```typescript
// main.tsx
import { initGrabby } from '@githumbi/grabby/react';

initGrabby();
```

Two differences from the Angular setup:

- `devOnly` defaults to `false`, because the `ngDevMode` flag it keys off doesn't
  exist in a React app. Gate it with `import.meta.env.DEV` if you only want it
  while developing.
- The Vite plugin also runs for production builds, so grabs still resolve to a
  file on a deployed site.

The stamp is prepended to each element's attributes, so a `{...props}` spread
still wins. For `<Button />` that means the stamp travels with the props onto
the rendered DOM node, and a grab points at the page rather than the library.

On `@vitejs/plugin-react` v4 and v5, which still compile with Babel, you can skip
the standalone plugin and pass the Babel plugin directly:

```typescript
import { grabbyBabelPlugin } from '@githumbi/grabby/babel';

react({ babel: { plugins: [grabbyBabelPlugin()] } });
```

### Collecting grabs from a deployed site

The MCP webhook posts to `http://localhost:3456/grab` by default, which a
deployed page can't reach. Point `webhookUrl` at an endpoint on the site itself
to gather feedback from a staging or preview deployment:

```typescript
initGrabby({ webhookUrl: '/api/grab' });
```

## Usage

Once installed, hover over any UI element in your browser and press:

- **Cmd+C** on Mac
- **Ctrl+C** on Windows/Linux

This copies the element's context to your clipboard:

```
<button class="submit-btn">Save</button>
in SubmitButtonComponent at src/app/submit-button/submit-button.component.ts:12
in FormComponent at src/app/form/form.component.ts:8
in AppComponent at src/app/app.component.ts:5
```

The output includes the cleaned HTML, the full Angular component stack trace, and source file locations.

## Features

- **Element selection** via keyboard shortcut or floating toolbar
- **Component stack trace** -- full Angular or React component ancestor chain with file paths
- **Open in VS Code** -- click file paths in the toast to open at the exact line
- **Freeze mode** -- press **F** during selection to freeze the page and grab tooltips, dropdowns, and hover menus
- **Floating toolbar** with selection, history, and enable controls
- **History** of previously grabbed elements with one-click re-copy; persists across page refreshes via localStorage
- **Light-only theme** for all UI
- **Plugin system** for custom actions, hooks, and theme overrides
- **Crosshair guidelines** during selection mode
- **Zero production impact** -- automatically disabled outside dev mode (Angular; React opts in, see above)

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+C / Ctrl+C (hold) | Activate selection mode |
| Click | Select element and copy |
| F (during selection) | Toggle freeze mode |
| Escape | Cancel comment popover |

## Configuration

```typescript
provideGrabby({
  activationKey: 'Meta+C',       // Keyboard shortcut
  activationMode: 'hold',        // 'hold' or 'toggle'
  keyHoldDuration: 0,            // ms to hold before activating
  maxContextLines: 20,           // Max HTML lines in clipboard
  enabled: true,                 // Master switch
  enableInInputs: false,         // Allow in input/textarea
  devOnly: true,                 // Only active in dev mode
  showToolbar: true,             // Show floating toolbar
  themeMode: 'light',            // only 'light' is supported
  persistHistory: true,          // persist history across page refresh
  webhookUrl: 'http://localhost:3456/grab', // where grabs are POSTed
});
```

## Toolbar

The floating toolbar provides quick access to core features without keyboard shortcuts:

| Button | Action |
|--------|--------|
| Hand | Toggle selection mode |
| Clock | Show grab history (one-click re-copy, clear all) |
| Power | Enable/disable grabby |
| X | Dismiss toolbar |

The grab flow is: hover → click → enter a comment → copy. Past grabs are listed in the history popover (clock icon) where you can re-copy (Copy all), clear them (Clear all), or click any entry to edit its comment.

Dismissing the toolbar doesn't disable grabby -- keyboard shortcuts still work, and activating selection mode brings the toolbar back.

## Plugin system

```typescript
import { registerGrabbyPlugin } from '@githumbi/grabby/angular';

registerGrabbyPlugin({
  name: 'my-plugin',
  hooks: {
    onElementSelect(context) {
      console.log('Selected:', context.selector);
    },
    onCopySuccess(text, context) {
      console.log('Copied:', context.componentName);
    },
    transformCopyContent(text, context) {
      return `// From ${context.componentName}\n${text}`;
    },
  },
});
```

### Plugin hooks

| Hook | Description |
|------|-------------|
| `onActivate` | Selection mode activated |
| `onDeactivate` | Selection mode deactivated |
| `onElementHover` | Mouse hovers over an element |
| `onElementSelect` | Element is selected |
| `onBeforeCopy` | About to copy to clipboard |
| `onGrab` | Grab recorded, with its comment — fires even if the copy then fails |
| `onCopySuccess` | Successfully copied |
| `onCopyError` | Copy failed |
| `transformCopyContent` | Transform clipboard text before copying |

Use `onGrab` rather than `onCopySuccess` to persist or forward grabs. The
clipboard write rejects for reasons that have nothing to do with the grab —
most often because the document isn't focused — and a grab must not be lost
when it does. `onCopySuccess` means only that the clipboard write worked.

### Plugin theme overrides

```typescript
registerGrabbyPlugin({
  name: 'custom-theme',
  theme: {
    overlayBorderColor: '#10b981',
    overlayBgColor: 'rgba(16, 185, 129, 0.1)',
    toolbarBgColor: '#1a1a2e',
    toolbarAccentColor: '#10b981',
  },
});
```

## API

Access the API programmatically via Angular's dependency injection:

```typescript
import { inject } from '@angular/core';
import { GRABBY_API } from '@githumbi/grabby/angular';

const api = inject(GRABBY_API);
api.activate();
```

### `GrabbyAPI`

| Method | Description |
|--------|-------------|
| `activate()` | Enter selection mode |
| `deactivate()` | Exit selection mode |
| `toggle()` | Toggle selection mode |
| `isActive()` | Check if selection mode is active |
| `setOptions(opts)` | Update options |
| `registerPlugin(plugin)` | Register a plugin |
| `unregisterPlugin(name)` | Remove a plugin |
| `setComponentResolver(fn)` | Custom component resolver |
| `setSourceResolver(fn)` | Custom source file resolver |
| `showToolbar()` | Show the floating toolbar |
| `hideToolbar()` | Hide the floating toolbar |
| `setThemeMode(mode)` | Retained for API compatibility; library is light-only |
| `getHistory()` | Get grab history entries |
| `clearHistory()` | Clear grab history |
| `dispose()` | Clean up everything |

## Subpath exports

The `@githumbi/grabby` package provides subpath exports for different build tool integrations:

| Import | Description |
|--------|-------------|
| `@githumbi/grabby` | Core picker engine and types |
| `@githumbi/grabby/angular` | Angular integration (providers, services, resolvers) |
| `@githumbi/grabby/react` | React integration (fiber resolver, `initGrabby`) |
| `@githumbi/grabby/vite-react` | Vite plugin that stamps JSX source locations |
| `@githumbi/grabby/babel` | Babel plugin behind the JSX stamping |
| `@githumbi/grabby/esbuild` | esbuild plugin for source location injection |
| `@githumbi/grabby/vite` | Vite plugin for source location injection |
| `@githumbi/grabby/webpack` | Webpack plugin for source location injection |
| `@githumbi/grabby/builder` | Angular CLI custom builders |
| `@githumbi/grabby/global` | IIFE browser bundle |

## MCP server (AI agent integration)

Connect grabby to AI coding agents like Claude Code, Cursor, or Windsurf so they can query your grabbed elements directly — no copy-pasting required.

Run this in your project root:

```bash
npx @githumbi/grabby add mcp
```

This writes a `.mcp.json` file to your project root. That file is the standard MCP config format read by Claude Code, Cursor, Windsurf, and other MCP-compatible editors. Commit it so teammates get the same setup, then restart your editor.

For a Claude Code global (user-level) install instead:

```bash
claude mcp add grabby -- npx -y @githumbi/grabby-server@latest
```

See [@githumbi/grabby-server](./packages/mcp-server) for the full setup guide, Docker option, and available MCP tools.

## License

MIT
