---
"@githumbi/grabby-server": patch
---

Security update: `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7 (fixes the high-severity advisories `pnpm audit` reported, plus patched `body-parser`, `hono`, `qs` and `fast-uri` underneath). Comment validation moved to `zod/mini` with English messages only, so the Cloudflare Worker is smaller than before (26 KB gzip, was 31 KB); validation results and error messages are unchanged.
