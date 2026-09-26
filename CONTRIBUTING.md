# Contributing to Grabby

Thanks for helping. Bug reports, framework adapters, docs fixes and ideas are all welcome.

## Setup

```bash
pnpm install        # Node 20+, pnpm 9
pnpm build
pnpm test
```

| Folder | |
|---|---|
| `packages/grabby` | the browser toolbar, capture, adapters, build plugin, CLI |
| `packages/server` | the collector, MCP server and `pull` |
| `examples/*` | one small app per framework; `pnpm --dir examples/react-vite dev` |

## Making a change

1. Branch from `main`.
2. Keep changes focused, and add tests: `packages/*/src/**/__tests__`. UI code is tested in jsdom; if you touch capture or the toolbar, also try it in an example app.
3. If a published package changes, run `pnpm changeset` and describe the change in one line for the changelog.
4. Open a PR. CI runs the build, tests, bundle-size budgets, publint and type-resolution checks.

## Guidelines

- **Context budget.** Anything added to a comment's capture costs tokens in every export. New fields should earn their place, and keep the tests in `capture.test.ts` passing.
- **Privacy first.** Never capture form values or anything a user typed. Run captured text through `redact()`.
- **No `innerHTML`.** Build UI with the `h()` helper in `core/ui/dom.ts`, so user text can never become markup.
- **Adapters read, never import, frameworks.** Use what the framework leaves on DOM nodes in development builds.
- **Bundle size.** The live-site loader and `/live` entry must stay under 1 KB gzipped (`pnpm size`).

## Adding a framework adapter

Implement `FrameworkAdapter` (`packages/grabby/src/core/adapters/types.ts`): `resolveComponent(el)` returns the owning component and its parents, and optionally `resolveSource(el)` and `cleanClasses()`. Add it to `DEFAULT_ADAPTERS`, write tests with fake instances (see `adapters.test.ts`), and add an example app.

## Code of conduct

Be kind; see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
