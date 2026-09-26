# Security policy

## Reporting a vulnerability

Please **don't open a public issue**. Report privately through GitHub:
**Security → Report a vulnerability** on this repository (private vulnerability reporting).

Include what you found, how to reproduce it, and the impact you see. You'll get an acknowledgement within 3 working days and a plan within 10. Fixes are released as soon as they're ready, with credit if you'd like it.

## Supported versions

The latest minor release of `@githumbi/grabby` and `@githumbi/grabby-server` receives security fixes.

## Scope

Especially interesting:

- Script injection through comments, component names, file paths or anything else rendered in Grabby's UI or exports.
- Capture of data it promises not to capture (form values, hidden inputs, credentials, tokens in URLs).
- Bypassing the collector's key, origin, session or admin-token checks; reading or deleting other people's comments.
- DNS rebinding or cross-site access to a local collector.
- Anything in the published packages that runs code you didn't ask for.

Out of scope: denial of service by volume against a self-hosted collector (put it behind your platform's rate limiting), and issues that need an already-compromised browser or machine.

## How releases are protected

Packages are published from GitHub Actions with npm trusted publishing (OIDC) and provenance; there are no long-lived npm tokens. You can verify a release with `npm audit signatures`.
