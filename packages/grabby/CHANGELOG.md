# @githumbi/grabby

## 0.1.0

First release as Grabby (formerly angular-grab).

- Compact, kind-aware capture (action, field, text, media, container, section) with screenshots, instead of full outerHTML. Form values are never captured and text is redacted.
- Comments collect in a panel; **Copy all** offers compact, standard or detailed exports with a token estimate, then **Copy & clear** (with Undo) or **Copy, keep comments**.
- Adapters for React, Angular, Vue 2 and 3, Svelte 4 and 5 and plain HTML, detected per element; one build plugin for Vite, webpack, Rspack, Rollup, Rolldown and esbuild.
- Live-site mode: feedback links, commenter name or anonymous, a 500-byte loader, and delivery to `@githumbi/grabby-server` with retries.
- UI isolated in a shadow root, safe under CSP and Trusted Types. Default shortcut is Option/Alt+G.
