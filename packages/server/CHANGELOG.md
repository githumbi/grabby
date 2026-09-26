# @githumbi/grabby-server

## 0.1.0

First release as the Grabby collector (formerly angular-grab-mcp).

- `init`, `start`, `mcp` and `pull` commands; JSON file store with no native dependencies.
- Local mode (loopback, no keys, DNS-rebinding protection) and public mode (project key, admin token, origin allowlist, rate limits).
- REST API for comments and screenshots; MCP tools to list, get (with screenshot), resolve and count comments.
