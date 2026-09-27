// Fails CI when a bundle grows past its budget. The loader and live entry are
// what every visitor of a live site downloads, so they get the tightest limits.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = [
  ['packages/grabby/dist/loader.global.js', 1_024],
  ['packages/grabby/dist/live/index.js', 1_024],
  ['packages/grabby/dist/grabby.global.js', 48 * 1024],
  // The collector Worker, inbox included (Cloudflare's free limit is 3 MB).
  ['packages/server/dist/worker/worker.js', 64 * 1024],
];

let failed = false;
for (const [file, limit] of budgets) {
  const size = gzipSync(readFileSync(new URL(`../${file}`, import.meta.url)), { level: 9 }).length;
  const ok = size <= limit;
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${size} B gzip (budget ${limit} B)`);
}
process.exit(failed ? 1 : 0);
