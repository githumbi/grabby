import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { patchViteConfig, patchEntry, patchAngularJson, patchAngularAppConfig } from '../utils/patch-source';
import { detectStack, installCommand } from '../utils/detect-stack';

describe('patchViteConfig', () => {
  const config = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

  it('adds the plugin first and imports it after the existing imports', () => {
    const out = patchViteConfig(config);
    expect(out.status).toBe('patched');
    if (out.status !== 'patched') return;
    expect(out.code).toContain("import react from '@vitejs/plugin-react';\nimport grabby from '@githumbi/grabby/plugin';");
    expect(out.code).toContain('plugins: [grabby.vite(), react()]');
  });

  it('is idempotent', () => {
    const once = patchViteConfig(config);
    if (once.status !== 'patched') throw new Error('expected a patch');
    expect(patchViteConfig(once.code).status).toBe('already');
  });

  it('declines configs it does not recognise', () => {
    expect(patchViteConfig('export default makeConfig()').status).toBe('unrecognised');
  });
});

describe('patchEntry', () => {
  const entry = `import { StrictMode } from 'react';
import {
  createRoot,
} from 'react-dom/client';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
`;

  it('starts Grabby in development after the imports', () => {
    const out = patchEntry(entry);
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toContain("import './index.css';\nimport { initGrabby } from '@githumbi/grabby';\n\nif (import.meta.env.DEV) initGrabby();\n\ncreateRoot");
  });

  it('sets up the lazy live entry for live feedback', () => {
    const out = patchEntry(entry, { live: { server: 'https://fb.example.com', projectKey: 'pk_x' } });
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toContain("import { initGrabbyLive } from '@githumbi/grabby/live';");
    expect(out.code).toContain('initGrabbyLive({ server: "https://fb.example.com", projectKey: "pk_x" });');
  });
});

describe('Angular patches', () => {
  it('swaps builders in place, keeping formatting', () => {
    const json = '{\n    "projects": { "app": { "architect": {\n      "build": { "builder": "@angular/build:application" },\n      "serve": { "builder": "@angular/build:dev-server" }\n    } } }\n}\n';
    const out = patchAngularJson(json);
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toBe(json.replace('@angular/build:application', '@githumbi/grabby:application').replace('@angular/build:dev-server', '@githumbi/grabby:dev-server'));
  });

  it('adds provideGrabby to the providers array', () => {
    const cfg = "import { ApplicationConfig } from '@angular/core';\n\nexport const appConfig: ApplicationConfig = {\n  providers: [provideRouter(routes)],\n};\n";
    const out = patchAngularAppConfig(cfg);
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toContain("import { provideGrabby } from '@githumbi/grabby/angular';");
    expect(out.code).toContain('providers: [provideGrabby(), provideRouter(routes)]');
  });
});

describe('detectStack', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('finds framework, Vite config, entry and package manager', () => {
    dir = mkdtempSync(join(tmpdir(), 'grabby-init-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { vue: '^3' }, devDependencies: { vite: '^6' } }));
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    writeFileSync(join(dir, 'vite.config.ts'), 'export default {}');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'main.ts'), '');
    const stack = detectStack(join(dir, 'src'));
    expect(stack).toMatchObject({ root: dir, framework: 'vue', packageManager: 'pnpm' });
    expect(stack.viteConfig).toBe(join(dir, 'vite.config.ts'));
    expect(stack.entry).toBe(join(dir, 'src', 'main.ts'));
    expect(installCommand('pnpm', '@githumbi/grabby', true)).toBe('pnpm add -D @githumbi/grabby');
  });
});
