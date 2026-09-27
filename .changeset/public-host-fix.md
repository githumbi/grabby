---
"@githumbi/grabby-server": patch
---

`start --public` now listens on all interfaces even when the config file came from an older `init`, which saved `"host": "127.0.0.1"` and kept a public collector unreachable. `init` no longer writes `host` or `port`.
