# Changesets

Every PR that changes a published package adds a changeset:

```bash
pnpm changeset
```

Pick the package(s), the bump (patch / minor / major) and write one line for
the changelog. On merge to `main` the release workflow opens a "Version
packages" PR; merging that publishes to npm with provenance.
