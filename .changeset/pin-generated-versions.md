---
'@githumbi/grabby': patch
---

Everything the CLI generates is now pinned to an exact version: the `.mcp.json` entry from `grabby add mcp` and `grabby pull` run one specific `@githumbi/grabby-server` release instead of any `0.x`, and the script tag printed by `grabby init` uses this exact version with Subresource Integrity hashes for the loader and the full build. Re-run `npx grabby add mcp` after upgrading to move the pin.
