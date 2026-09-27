---
"@githumbi/grabby": patch
---

`share` no longer fails with "could not create the inbox link (404)" right after setting up a new collector: it waits while the new Worker reaches all of Cloudflare's servers. It also saves its settings as soon as the collector exists, so if a later step fails, running `share` again just works instead of asking for `--rotate-admin`.

`share` now also adds the script to Astro sites: the one layout in `src/layouts/` that renders `</body>`, as an `is:inline` tag so Astro leaves it as written.
