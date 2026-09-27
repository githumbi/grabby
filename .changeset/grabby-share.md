---
"@githumbi/grabby": minor
---

New `npx @githumbi/grabby share`: one command from nothing to a feedback link. It sets up a collector in your own free Cloudflare account (or connects one you run, with `--server`), adds the script to your site (including Next.js App Router layouts, automatically), and prints a link for reviewers and a private inbox link for you. Settings are saved in a gitignored `.grabby/config.json`, so re-running is safe and `npx @githumbi/grabby pull` needs no flags.

Also new: `npx @githumbi/grabby inbox` opens the inbox, and `npx @githumbi/grabby alerts --slack <webhook>` posts new feedback to Slack.
