import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
  outDir: 'dist',
  target: 'node20',
  // Only the formatter is taken from the browser package; bundling it keeps
  // Babel and the screenshot renderer out of server installs.
  noExternal: ['@githumbi/grabby'],
});
