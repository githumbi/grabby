import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { createGrabbyServer, type GrabbyHttpServer } from '../http';
import { CommentStore } from '../store';
import { LocalSource, RemoteSource } from '../source';
import { pull } from '../pull';
import type { ServerConfig } from '../config';

const SITE = 'https://shop.example';
const PK = 'pk_testtesttesttest';
const SK = 'sk_admintokenadmintokenadmin';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);

let seq = 0;
function comment(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `cmt_${String(seq).padStart(6, '0')}_abcdef`,
    createdAt: Date.now() + seq,
    comment: `Make it pop ${seq}`,
    author: { name: 'Jane', anonymous: false, sessionId: 'sess_aaaaaaaaaaaa' },
    page: { route: '/pricing', title: 'Pricing', viewport: [1280, 800] },
    target: {
      kind: 'action', tag: 'button', component: 'BuyButton',
      source: { file: 'src/Buy.tsx', line: 3, column: 1 },
      stack: [], selector: '#buy', preview: '<button id="buy">Buy</button>',
      facts: { label: 'Buy' }, extra: {},
    },
    framework: 'React',
    ...overrides,
  };
}

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: string }

/** Raw http so tests control Origin and Host exactly (fetch forbids setting Host). */
function call(port: number, method: string, pathname: string, opts: { headers?: Record<string, string>; body?: string | Buffer } = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: pathname, headers: { host: `localhost:${port}`, ...opts.headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function makeConfig(dataDir: string, overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    version: 1, public: false, host: '127.0.0.1', port: 0, adminToken: SK, dataDir,
    projects: [{ id: 'shop', name: 'Shop', publicKey: PK, allowedOrigins: [SITE] }],
    ...overrides,
  };
}

describe('grabby-server', () => {
  let dir: string;
  let srv: GrabbyHttpServer;
  let port: number;
  let store: CommentStore;

  async function boot(overrides: Partial<ServerConfig> = {}) {
    store = new CommentStore(dir);
    srv = createGrabbyServer(makeConfig(dir, overrides), store);
    ({ port } = await srv.listen());
  }

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    call(port, 'POST', '/v1/comments', { headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'grabby-')); });
  afterEach(async () => { await srv?.close(); rmSync(dir, { recursive: true, force: true }); });

  describe('public mode', () => {
    beforeEach(() => boot({ public: true }));

    it('accepts a comment with the project key from an allowed origin', async () => {
      const res = await post({ comment: comment() }, { origin: SITE, 'x-grabby-key': PK });
      expect(res.status).toBe(201);
      expect(res.headers['access-control-allow-origin']).toBe(SITE);
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0]).toMatchObject({ projectId: 'shop', origin: SITE, status: 'open' });
    });

    it('rejects a missing or wrong key, and origins not on the list', async () => {
      expect((await post({ comment: comment() }, { origin: SITE })).status).toBe(401);
      expect((await post({ comment: comment() }, { origin: SITE, 'x-grabby-key': 'pk_nope' })).status).toBe(401);
      const evil = await post({ comment: comment() }, { origin: 'https://evil.example', 'x-grabby-key': PK });
      expect(evil.status).toBe(403);
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('requires the admin token to read, and never accepts the public key for it', async () => {
      await post({ comment: comment() }, { origin: SITE, 'x-grabby-key': PK });
      expect((await call(port, 'GET', '/v1/comments')).status).toBe(401);
      expect((await call(port, 'GET', '/v1/comments', { headers: { authorization: `Bearer ${PK}` } })).status).toBe(401);
      const ok = await call(port, 'GET', '/v1/comments', { headers: { authorization: `Bearer ${SK}` } });
      expect(ok.status).toBe(200);
      expect(JSON.parse(ok.body).comments).toHaveLength(1);
    });

    it('validates and caps input instead of storing it as received', async () => {
      expect((await post({ comment: { ...comment(), comment: '   ' } }, { origin: SITE, 'x-grabby-key': PK })).status).toBe(400);
      expect((await post({ comment: { ...comment(), id: '../../etc' } }, { origin: SITE, 'x-grabby-key': PK })).status).toBe(400);
      const res = await post({ comment: comment({ injected: 'x', target: { ...comment().target, preview: 'p'.repeat(5000) } }) }, { origin: SITE, 'x-grabby-key': PK });
      expect(res.status).toBe(201);
      const saved = store.list()[0] as unknown as Record<string, unknown> & { target: { preview: string } };
      expect(saved.injected).toBeUndefined();
      expect(saved.target.preview.length).toBe(400);
    });

    it('lets only the authoring session attach a screenshot, and checks the bytes', async () => {
      const c = comment();
      await post({ comment: c }, { origin: SITE, 'x-grabby-key': PK });
      const put = (session: string, body: Buffer) => call(port, 'PUT', `/v1/comments/${c.id}/screenshot?w=100&h=50`, {
        headers: { origin: SITE, 'x-grabby-key': PK, 'x-grabby-session': session, 'content-type': 'image/webp' }, body,
      });
      expect((await put('sess_someoneelse', WEBP)).status).toBe(404);
      expect((await put(c.author.sessionId, Buffer.from('<svg onload=alert(1)>'))).status).toBe(415);
      expect((await put(c.author.sessionId, WEBP)).status).toBe(200);
      expect(store.get(c.id)?.screenshot).toEqual({ url: `/v1/screenshots/${c.id}`, width: 100, height: 50 });
      const img = await call(port, 'GET', `/v1/screenshots/${c.id}`, { headers: { authorization: `Bearer ${SK}` } });
      expect(img.headers['content-type']).toBe('image/webp');
      expect(img.headers['x-content-type-options']).toBe('nosniff');
    });

    it('treats a retried comment as an update, but not from another session', async () => {
      const c = comment();
      expect((await post({ comment: c }, { origin: SITE, 'x-grabby-key': PK })).status).toBe(201);
      expect((await post({ comment: { ...c, comment: 'edited' } }, { origin: SITE, 'x-grabby-key': PK })).status).toBe(200);
      const hijack = { ...c, author: { ...c.author, sessionId: 'sess_attacker0000' } };
      expect((await post({ comment: hijack }, { origin: SITE, 'x-grabby-key': PK })).status).toBe(409);
      expect(store.get(c.id)?.comment).toBe('edited');
    });
  });

  describe('local mode', () => {
    beforeEach(() => boot({ public: false, adminToken: '' }));

    it('accepts comments from localhost pages without a key', async () => {
      expect((await post({ comment: comment() }, { origin: 'http://localhost:5173' })).status).toBe(201);
      expect((await post({ comment: comment() }, { origin: 'http://myapp.test' })).status).toBe(201);
      expect(store.list()[0].projectId).toBe('local');
    });

    it('refuses other websites, and requests re-pointed at localhost by DNS rebinding', async () => {
      expect((await post({ comment: comment() }, { origin: 'https://evil.example' })).status).toBe(403);
      const rebinding = await call(port, 'GET', '/v1/comments', { headers: { host: `evil.example:${port}` } });
      expect(rebinding.status).toBe(421);
    });

    it('lets this machine read without a token, but not a web page from another origin', async () => {
      await post({ comment: comment() }, { origin: 'http://localhost:5173' });
      expect((await call(port, 'GET', '/v1/comments')).status).toBe(200);
      expect((await call(port, 'GET', '/v1/comments', { headers: { origin: 'https://evil.example' } })).status).toBe(401);
    });
  });

  describe('pull', () => {
    beforeEach(() => boot({ public: false }));

    it('prints open comments, downloads screenshots and resolves them, so the next pull is empty', async () => {
      const c = comment();
      await post({ comment: c }, { origin: 'http://localhost:3000' });
      await post({ comment: comment({ author: { name: null, anonymous: true, sessionId: 'bbbb2222-0000-4000-8000-000000000000' } }) }, { origin: 'http://localhost:3000' });
      await call(port, 'PUT', `/v1/comments/${c.id}/screenshot`, { headers: { origin: 'http://localhost:3000', 'x-grabby-session': c.author.sessionId }, body: WEBP });

      const remote = new RemoteSource(`http://127.0.0.1:${port}`, SK);
      const shots = path.join(dir, 'pulled');
      const first = await pull(remote, { screenshotsDir: shots });
      expect(first.count).toBe(2);
      expect(first.screenshots).toBe(1);
      expect(first.text).toContain('From: Jane, Anonymous bbbb');
      expect(first.text).toMatch(/screenshot: .*pulled[\\/]cmt_.*\.webp/);
      expect(existsSync(path.join(shots, `${c.id}.webp`))).toBe(true);

      expect((await pull(remote)).count).toBe(0);
      expect(store.list({ status: 'resolved' })).toHaveLength(2);
    });

    it('can keep or delete instead of resolving', async () => {
      await post({ comment: comment() }, { origin: 'http://localhost:3000' });
      const local = new LocalSource(store);
      expect((await pull(local, { after: 'keep' })).count).toBe(1);
      expect((await pull(local, { after: 'delete' })).count).toBe(1);
      expect(store.list({ status: 'all' })).toHaveLength(0);
    });
  });
});
