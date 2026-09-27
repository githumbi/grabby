import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const define = { __SERVER_VERSION__: JSON.stringify(version) };

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    // The two builds run in parallel; each cleans only its own output.
    clean: ['cli.js'],
    shims: true,
    banner: { js: '#!/usr/bin/env node' },
    outDir: 'dist',
    target: 'node20',
    // Only the formatter is taken from the browser package; bundling it keeps
    // Babel and the screenshot renderer out of server installs.
    noExternal: ['@githumbi/grabby'],
    define,
  },
  {
    // The Cloudflare Worker, as one self-contained file. `grabby share`
    // deploys this exact file (wrangler --no-bundle), so what runs is what
    // npm published, with provenance.
    entry: { 'worker/worker': 'src/worker/index.ts' },
    format: ['esm'],
    dts: false,
    clean: ['worker'],
    platform: 'neutral',
    target: 'es2022',
    outDir: 'dist',
    minify: true,
    noExternal: [/.*/],
    define,
    esbuildOptions(options) {
      options.conditions = ['workerd', 'worker', 'browser', 'import', 'default'];
      options.mainFields = ['module', 'main'];
    },
  },
]);
