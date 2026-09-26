import { defineConfig } from 'tsup';

export default defineConfig([
  // 1. Core and the lazy live entry: ESM (code-split, so /live pulls the
  //    core in as a separate chunk only when needed) + CJS + types
  {
    entry: { 'core/index': 'src/core/index.ts', 'live/index': 'src/live.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    sourcemap: true,
    splitting: true,
    outDir: 'dist',
  },
  // 1b. DOM-free exporter for Node (used by the server)
  {
    entry: { 'export/index': 'src/export.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
  },
  // 2. Script-tag builds: the full UI, and a ~1 KB loader for live sites
  {
    entry: { grabby: 'src/core/index.global.ts' },
    format: ['iife'],
    outDir: 'dist',
    clean: false,
    minify: true,
    // A script tag can't resolve bare imports, so the screenshot renderer
    // is bundled in (it's still only executed on first use).
    noExternal: ['modern-screenshot'],
  },
  {
    entry: { loader: 'src/core/loader.global.ts' },
    format: ['iife'],
    outDir: 'dist',
    clean: false,
    minify: true,
  },
  // 3. Angular: ESM + types
  {
    entry: { 'angular/index': 'src/angular/index.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['@angular/core'],
  },
  // 4. Esbuild plugin: ESM + CJS + types
  {
    entry: { 'esbuild-plugin/index': 'src/esbuild-plugin/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['esbuild', 'typescript'],
  },
  // 5. Build plugin (unplugin): ESM + CJS + types
  {
    entry: { 'plugin/index': 'src/plugin/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    shims: true,
    external: ['@babel/core', 'vue', 'vue/compiler-sfc', 'unplugin'],
  },
  // 5b. React: ESM + types
  {
    entry: { 'react/index': 'src/react/index.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
  },
  // 5c. Babel plugin (React source stamping): ESM + CJS + types
  {
    entry: { 'babel-plugin/index': 'src/babel-plugin/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    external: ['@babel/core'],
  },
  // 7. Builder: CJS only (Angular CLI requirement)
  // Angular CLI uses require() to load builders. Since the root package is
  // "type": "module", we force .js output and write a nested package.json
  // with "type": "commonjs" so Node treats these .js files as CJS.
  {
    entry: {
      'builder/index': 'src/builder/index.ts',
      'builder/builders/application/index': 'src/builder/builders/application/index.ts',
      'builder/builders/dev-server/index': 'src/builder/builders/dev-server/index.ts',
    },
    format: ['cjs'],
    dts: false,
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.js' }),
    external: ['@angular/build', '@angular-devkit/architect'],
  },
  // 8. CLI: ESM with shebang
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    clean: false,
    sourcemap: true,
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
