import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { patchLoaderTag, type LiveTag } from '../utils/patch-source';
import { ensureGitignore } from '../utils/project-config';
import { toOrigin } from '../utils/detect-site';

const runServer = vi.fn();
vi.mock('../utils/server-cli', () => ({ runServer: (...args: unknown[]) => runServer(...args) }));
const { share, siteTarget } = await import('../commands/share');
const { detectStack } = await import('../utils/detect-stack');

const TAG: LiveTag = {
  src: 'https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.2.0/dist/loader.global.js',
  integrity: 'sha384-LOADER', dataIntegrity: 'sha384-FULL', server: 'https://grabby-shop.jane.workers.dev', projectKey: 'pk_live',
};

describe('patchLoaderTag', () => {
  // The raw tag the procurement portal was set up with by hand, pointing at a tunnel.
  const portal = `      <body className="x">
        <SessionProvider>{children}</SessionProvider>
        <script
          src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.1.1/dist/loader.global.js"
          data-mode="live"
          data-server="https://pda-monitors-spam-ronald.trycloudflare.com"
          data-project-key="pk_fDJw0rASNkgYNa-HSfqZnw"
          defer
        ></script>
      </body>`;

  it('rewrites an existing raw tag in place, as JSX', () => {
    const out = patchLoaderTag(portal, TAG, 'next-app');
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).not.toContain('trycloudflare');
    expect(out.code).toContain('data-server="https://grabby-shop.jane.workers.dev"');
    expect(out.code).toContain('crossOrigin="anonymous"');
    expect(out.code).toContain('        <script\n          src=');
    expect(out.code.match(/loader\.global\.js/g)).toHaveLength(1);
    expect(patchLoaderTag(out.code, TAG, 'next-app').status).toBe('already');
  });

  it('adds next/script to an App Router layout, importing it once', () => {
    const layout = 'import "./globals.css";\n\nexport default function RootLayout({ children }) {\n  return (\n    <html>\n      <body>\n        {children}\n      </body>\n    </html>\n  );\n}\n';
    const out = patchLoaderTag(layout, TAG, 'next-app');
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toContain('import Script from "next/script";');
    expect(out.code).toContain('<Script\n');
    expect(out.code).toContain('strategy="afterInteractive"');
    expect(out.code.indexOf('<Script')).toBeLessThan(out.code.indexOf('</body>'));
    const again = patchLoaderTag(out.code, { ...TAG, server: 'https://other.workers.dev' }, 'next-app');
    if (again.status !== 'patched') throw new Error(again.status);
    expect(again.code.match(/next\/script/g)).toHaveLength(1);
    expect(again.code).toContain('https://other.workers.dev');
  });

  it('uses an existing next/script import name, writes plain HTML for HTML, and declines unclear files', () => {
    const named = 'import NextScript from "next/script";\nexport default () => <html><body></body></html>;\n';
    const out = patchLoaderTag(named, TAG, 'next-app');
    if (out.status !== 'patched') throw new Error(out.status);
    expect(out.code).toContain('<NextScript\n');
    const html = patchLoaderTag('<html>\n  <body>\n  </body>\n</html>\n', TAG, 'html');
    if (html.status !== 'patched') throw new Error(html.status);
    expect(html.code).toContain('crossorigin="anonymous"');
    expect(html.code).toContain('defer\n    ></script>');
    expect(patchLoaderTag('<div></div>', TAG, 'html').status).toBe('unrecognised');
  });
});

/** The fake server CLI writes its result where `--out` says, like the real one. */
function deployResult(result: Record<string, unknown>) {
  runServer.mockImplementation(async (args: string[]) => {
    const out = args[args.indexOf('--out') + 1];
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, JSON.stringify(result));
    return { code: 0, stdout: '' };
  });
}

describe('share', () => {
  let dir: string;
  let sent: Array<{ url: string; method: string; auth: string | null; body?: string }>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grabby-share-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { next: '16.0.0', react: '19.0.0' } }));
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app', 'layout.tsx'), 'export default function L({ children }) {\n  return (\n    <html>\n      <body>\n        {children}\n      </body>\n    </html>\n  );\n}\n');
    sent = [];
    runServer.mockReset();
    deployResult({ url: 'https://grabby-shop.jane.workers.dev', projectKey: 'pk_new', adminToken: 'sk_new_admin_token_0123456789', worker: 'grabby-shop', database: 'db-1', origins: [] });
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string>;
      sent.push({ url, method: init.method ?? 'GET', auth: headers?.Authorization ?? null, body: init.body as string | undefined });
      if (url.endsWith('/v1/admin/inbox-token')) {
        return Response.json({ token: 'ik_one', url: 'https://grabby-shop.jane.workers.dev/inbox#k=ik_one' });
      }
      return Response.json({ ok: true });
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

  it('deploys, patches the layout, and saves private settings without putting tokens in .mcp.json', async () => {
    await share({ cwd: dir, origins: ['shop.example'], yes: true });
    const [args, opts] = runServer.mock.calls[0] as [string[], { env: Record<string, string | undefined> }];
    expect(args.slice(0, 3)).toEqual(['deploy', 'cloudflare', '--out']);
    expect(existsSync(args[3])).toBe(false); // the result file, with the admin token, is gone
    expect(args).toContain('https://shop.example');
    expect(args).toContain('http://localhost:3000');
    expect(args.join(' ')).not.toContain('sk_');
    expect(opts.env.GRABBY_ADMIN_TOKEN).toBeUndefined();

    expect(readFileSync(join(dir, 'app', 'layout.tsx'), 'utf8')).toContain('data-project-key="pk_new"');
    const configFile = join(dir, '.grabby', 'config.json');
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    expect(config).toMatchObject({ server: 'https://grabby-shop.jane.workers.dev', projectKey: 'pk_new', adminToken: 'sk_new_admin_token_0123456789', inbox: 'https://grabby-shop.jane.workers.dev/inbox#k=ik_one', deploy: { kind: 'cloudflare' } });
    if (process.platform !== 'win32') expect(statSync(configFile).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.grabby/');
    const mcp = readFileSync(join(dir, '.mcp.json'), 'utf8');
    expect(mcp).toContain('grabby-server');
    expect(mcp).not.toMatch(/sk_|ik_/);
    expect(sent.find((s) => s.url.endsWith('/v1/admin/inbox-token'))?.auth).toBe('Bearer sk_new_admin_token_0123456789');
  });

  it('re-runs with the saved key and token, keeping a working inbox link', async () => {
    await share({ cwd: dir, origins: ['shop.example'], yes: true, noMcp: true });
    deployResult({ url: 'https://grabby-shop.jane.workers.dev', projectKey: 'pk_new', worker: 'grabby-shop', database: 'db-1' });
    sent.length = 0;
    await share({ cwd: dir, yes: true, noMcp: true });
    const [args, opts] = runServer.mock.calls[1] as [string[], { env: Record<string, string | undefined> }];
    expect(args).toEqual(expect.arrayContaining(['--key', 'pk_new', 'https://shop.example']));
    expect(opts.env.GRABBY_ADMIN_TOKEN).toBe('sk_new_admin_token_0123456789');
    expect(sent.some((s) => s.url.endsWith('/v1/admin/inbox-token'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, '.grabby', 'config.json'), 'utf8')).adminToken).toBe('sk_new_admin_token_0123456789');
    await share({ cwd: dir, yes: true, noMcp: true, rotate: true });
    expect(sent.some((s) => s.url.endsWith('/v1/admin/inbox-token'))).toBe(true);
  });

  it('on a new computer, keeps the project key already in the site', async () => {
    writeFileSync(join(dir, 'app', 'layout.tsx'), 'export default () => (\n  <html>\n    <body>\n      <script src="https://cdn.jsdelivr.net/npm/@githumbi/grabby@0.2.0/dist/loader.global.js" data-mode="live" data-server="https://grabby-shop.jane.workers.dev" data-project-key="pk_keepthiskey123" defer></script>\n    </body>\n  </html>\n);\n');
    await share({ cwd: dir, origins: ['https://shop.example'], yes: true, noMcp: true, rotateAdmin: true });
    const [args] = runServer.mock.calls[0] as [string[]];
    expect(args).toEqual(expect.arrayContaining(['--key', 'pk_keepthiskey123', '--rotate-admin']));
  });

  it('changes nothing on a dry run', async () => {
    await share({ cwd: dir, origins: ['https://shop.example'], dryRun: true });
    expect(runServer).not.toHaveBeenCalled();
    expect(readFileSync(join(dir, 'app', 'layout.tsx'), 'utf8')).not.toContain('grabby');
  });

  it('finds where the tag goes', () => {
    expect(siteTarget(detectStack(dir))).toMatchObject({ kind: 'next-app' });
  });
});

describe('helpers', () => {
  it('turns what people type into origins', () => {
    expect(toOrigin('my-app.netlify.app')).toBe('https://my-app.netlify.app');
    expect(toOrigin('https://x.com/some/path?q')).toBe('https://x.com');
    expect(toOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(toOrigin('not a site')).toBeNull();
    expect(toOrigin('javascript:alert(1)')).toBeNull();
  });

  it('adds .grabby/ to .gitignore once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grabby-gi-'));
    try {
      writeFileSync(join(dir, '.gitignore'), 'node_modules');
      expect(ensureGitignore(dir)).toBe(true);
      expect(ensureGitignore(dir)).toBe(false);
      expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n# Grabby: collector settings and admin token\n.grabby/\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
