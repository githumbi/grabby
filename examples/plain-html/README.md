# Plain HTML example

No framework, no build step: Grabby is one script tag.

```bash
pnpm dev   # http://localhost:5173
```

- `index.html`: developer mode. Press Alt+G / Option+G, click anything, comment, then Copy all.
- `live.html`: live-site mode. Nothing shows for normal visitors; reviewers open `live.html?grabby=pk_demo_local_only`.

For `live.html`, run a collector with a demo key first:

```bash
GRABBY_PUBLIC_KEY=pk_demo_local_only \
GRABBY_ADMIN_TOKEN=sk_demo_local_only_not_secret \
GRABBY_ALLOWED_ORIGINS=http://localhost:5173 \
npx @githumbi/grabby-server start --public --host 127.0.0.1 --data-dir ./.grabby-demo
```

Then pull what reviewers sent:

```bash
npx @githumbi/grabby-server pull --server http://localhost:3456 --token sk_demo_local_only_not_secret
```
