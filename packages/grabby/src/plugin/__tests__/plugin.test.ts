import { describe, it, expect } from 'vitest';
import { unplugin, stampVue } from '../index';

type Hooks = {
  enforce?: string;
  transformInclude: (id: string) => boolean;
  transform: (code: string, id: string) => Promise<{ code: string; map?: unknown } | null>;
  vite: { configResolved: (c: { command: string; root?: string }) => void };
};

function hooks(options = {}): Hooks {
  return unplugin.raw({ rootDir: '/app', ...options }, { framework: 'vite' } as never) as unknown as Hooks;
}

async function run(code: string, id: string, options = {}) {
  const h = hooks(options);
  if (!h.transformInclude(id)) return null;
  return h.transform(code, id);
}

describe('grabby build plugin', () => {
  it('runs before framework plugins', () => {
    expect(hooks().enforce).toBe('pre');
  });

  it('stamps a tsx file and keeps the JSX intact', async () => {
    const result = await run('export const A = () => <div className="x">hi</div>;', '/app/src/A.tsx');
    expect(result?.code).toContain('data-grabby-loc="src/A.tsx:1:24"');
    expect(result?.code).toContain('<div');
  });

  it('preserves type annotations and returns a source map', async () => {
    const result = await run('export const A = (p: { n: number }) => <div>{p.n}</div>;', '/app/src/A.tsx');
    expect(result?.code).toContain('p: {');
    expect(result?.map).toBeTruthy();
  });

  it('skips non-JSX files, node_modules and files without JSX', async () => {
    expect(await run('const a = 1 < 2;', '/app/src/util.ts')).toBeNull();
    expect(await run('const a = <div />;', '/app/node_modules/x/i.jsx')).toBeNull();
    expect(await run('export const a = 1;', '/app/src/A.tsx')).toBeNull();
  });

  it('ignores a query suffix on JSX module ids', async () => {
    const result = await run('const a = <div />;', '/app/src/A.jsx?t=123');
    expect(result?.code).toContain('data-grabby-loc="src/A.jsx:1:11"');
  });

  it('stamps paths relative to the Vite root, wherever the process started', async () => {
    const h = unplugin.raw({}, { framework: 'vite' } as never) as unknown as Hooks;
    h.vite.configResolved({ command: 'serve', root: '/work/app' });
    const out = await h.transform('const a = <div />;', '/work/app/src/A.jsx');
    expect(out?.code).toContain('data-grabby-loc="src/A.jsx:1:11"');
  });

  it('is dev-only in Vite unless includeSourceInBuild is set', () => {
    const build = hooks();
    build.vite.configResolved({ command: 'build' });
    expect(build.transformInclude('/app/src/A.tsx')).toBe(false);

    const serve = hooks();
    serve.vite.configResolved({ command: 'serve' });
    expect(serve.transformInclude('/app/src/A.tsx')).toBe(true);

    const opted = hooks({ includeSourceInBuild: true });
    opted.vite.configResolved({ command: 'build' });
    expect(opted.transformInclude('/app/src/A.tsx')).toBe(true);
  });
});

describe('Vue templates', () => {
  const sfc = [
    '<script setup lang="ts">',
    'import Child from "./Child.vue"',
    '</script>',
    '',
    '<template>',
    '  <section class="hero">',
    '    <Child :x="1" />',
    '    <h1 v-if="true">Hi</h1>',
    '    <button @click="go">Go</button>',
    '  </section>',
    '</template>',
    '',
    '<style scoped>.hero { color: red; }</style>',
  ].join('\n');

  it('stamps native elements with file:line:col and leaves components alone', async () => {
    const out = await stampVue(sfc, 'src/components/Hero.vue');
    expect(out?.code).toContain('<section data-grabby-loc="src/components/Hero.vue:6:3" class="hero">');
    expect(out?.code).toContain('<h1 data-grabby-loc="src/components/Hero.vue:8:5" v-if="true">');
    expect(out?.code).toContain('<button data-grabby-loc="src/components/Hero.vue:9:5" @click="go">');
    expect(out?.code).toContain('<Child :x="1" />');
    expect(out?.code).toContain('<script setup lang="ts">\nimport Child');
    expect(out?.code).toContain('.hero { color: red; }');
  });

  it('only transforms the main .vue request, not its style/template sub-requests', () => {
    const h = hooks();
    expect(h.transformInclude('/app/src/Hero.vue')).toBe(true);
    expect(h.transformInclude('/app/src/Hero.vue?vue&type=style&index=0&lang.css')).toBe(false);
  });

  it('leaves pug templates alone', async () => {
    expect(await stampVue('<template lang="pug">div hi</template>', 'src/A.vue')).toBeNull();
  });

  it('does not stamp twice', async () => {
    const once = await stampVue(sfc, 'src/components/Hero.vue');
    const twice = await stampVue(once!.code, 'src/components/Hero.vue');
    expect(twice).toBeNull();
  });
});
