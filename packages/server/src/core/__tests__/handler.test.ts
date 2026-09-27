import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHandler, type Peer, type RequestHandler } from '../handler';
import { MemoryStorage } from '../memory-storage';
import { sha256Hex } from '../crypto';
import type { CollectorConfig } from '../config';
import { PK, SITE, SK, WEBP, incoming } from './fixtures';

type Body = string | Uint8Array;

const REMOTE: Peer = { ip: '203.0.113.9', loopback: false, host: 'collector.example' };
const LOCAL: Peer = { ip: '127.0.0.1', loopback: true, host: 'localhost:3456' };

const config = (overrides: Partial<CollectorConfig> = {}): CollectorConfig => ({
  public: true, adminToken: SK, projects: [{ id: 'shop', name: 'Shop', publicKey: PK, allowedOrigins: [SITE] }], ...overrides,
});

function req(method: string, path: string, init: { headers?: Record<string, string>; body?: Body } = {}) {
  return new Request(`https://collector.example${path}`, { method, headers: init.headers, body: init.body });
}

describe('request handler', () => {
  let storage: MemoryStorage;
  let handle: RequestHandler;
  const post = (body: unknown, headers: Record<string, string> = { origin: SITE, 'x-grabby-key': PK }) =>
    handle(req('POST', '/v1/comments', { headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), REMOTE);

  beforeEach(() => {
    storage = new MemoryStorage();
    handle = createHandler(config(), { storage, log: () => {} });
  });

  it('accepts a comment from an allowed site and reflects CORS only for it', async () => {
    const ok = await post({ comment: incoming() });
    expect(ok.status).toBe(201);
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(ok.headers.get('content-security-policy')).toContain("default-src 'none'");
    const evil = await post({ comment: incoming() }, { origin: 'https://evil.example', 'x-grabby-key': PK });
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers preflights for allowed origins only', async () => {
    expect((await handle(req('OPTIONS', '/v1/comments', { headers: { origin: SITE } }), REMOTE)).status).toBe(204);
    expect((await handle(req('OPTIONS', '/v1/comments', { headers: { origin: 'https://evil.example' } }), REMOTE)).status).toBe(403);
  });

  it('rejects oversized bodies with 413, and non-images with 415', async () => {
    const big = await post({ comment: { ...incoming(), comment: 'x'.repeat(70_000) } });
    expect(big.status).toBe(413);
    const c = incoming();
    await post({ comment: c });
    const shot = (body: Body) => handle(req('PUT', `/v1/comments/${c.id}/screenshot?w=4&h=2`, {
      headers: { origin: SITE, 'x-grabby-key': PK, 'x-grabby-session': c.author.sessionId }, body,
    }), REMOTE);
    expect((await shot('<svg onload=alert(1)>')).status).toBe(415);
    expect((await shot(WEBP)).status).toBe(200);
    const small = createHandler(config(), { storage, log: () => {}, limits: { maxImageBytes: 10 } });
    const tooBig = await small(req('PUT', `/v1/comments/${c.id}/screenshot`, {
      headers: { origin: SITE, 'x-grabby-key': PK, 'x-grabby-session': c.author.sessionId }, body: WEBP,
    }), REMOTE);
    expect(tooBig.status).toBe(413);
  });

  it('never trusts a local peer on a public collector', async () => {
    await post({ comment: incoming() });
    expect((await handle(req('GET', '/v1/comments'), LOCAL)).status).toBe(401);
    expect((await handle(req('GET', '/v1/comments', { headers: { authorization: `Bearer ${SK}` } }), REMOTE)).status).toBe(200);
  });

  it('accepts the inbox token for reading once its hash is stored', async () => {
    const ik = 'ik_inboxinboxinboxinbox';
    const read = () => handle(req('GET', '/v1/comments', { headers: { authorization: `Bearer ${ik}` } }), REMOTE);
    expect((await read()).status).toBe(401);
    await storage.setSetting('inbox.tokenHash', await sha256Hex(ik));
    expect((await read()).status).toBe(200);
  });

  it('refuses unexpected Host headers on a local collector', async () => {
    const local = createHandler(config({ public: false, adminToken: '' }), { storage, log: () => {} });
    expect((await local(req('GET', '/v1/comments'), LOCAL)).status).toBe(200);
    expect((await local(req('GET', '/v1/comments'), { ...LOCAL, host: 'evil.example:3456' })).status).toBe(421);
  });
});

describe('inbox and settings routes', () => {
  let storage: MemoryStorage;
  let handle: RequestHandler;
  const admin = { authorization: `Bearer ${SK}` };
  const inbox = { html: '<link href="/inbox/app.__HASH__.css"><script src="/inbox/app.__HASH__.js"></script>', js: 'console.log(1)', css: 'body{}', hash: 'abc123' };

  beforeEach(() => {
    storage = new MemoryStorage();
    handle = createHandler(config(), { storage, log: () => {}, inbox });
  });

  it('serves the inbox page with a strict, script-src self CSP and hashed assets', async () => {
    const page = await handle(req('GET', '/inbox'), REMOTE);
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    const csp = page.headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(await page.text()).toContain('/inbox/app.abc123.js');
    const js = await handle(req('GET', '/inbox/app.abc123.js'), REMOTE);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await handle(req('GET', '/inbox/app.other.js'), REMOTE)).status).toBe(404);
  });

  it('issues an inbox link that can read but not change settings, and rotating it revokes the old one', async () => {
    expect((await handle(req('POST', '/v1/admin/inbox-token'), REMOTE)).status).toBe(401);
    const first = await (await handle(req('POST', '/v1/admin/inbox-token', { headers: admin }), REMOTE)).json() as { token: string; url: string };
    expect(first.url).toBe(`https://collector.example/inbox#k=${first.token}`);
    const asInbox = (t: string) => ({ authorization: `Bearer ${t}` });
    const meta = await handle(req('GET', '/v1/meta', { headers: asInbox(first.token) }), REMOTE);
    expect(await meta.json()).toMatchObject({ role: 'inbox', projects: [{ publicKey: PK, allowedOrigins: [SITE] }] });
    expect((await handle(req('POST', '/v1/admin/inbox-token', { headers: asInbox(first.token) }), REMOTE)).status).toBe(403);
    expect((await handle(req('PUT', '/v1/admin/alerts', { headers: asInbox(first.token), body: '{}' }), REMOTE)).status).toBe(403);

    const second = await (await handle(req('POST', '/v1/admin/inbox-token', { headers: admin }), REMOTE)).json() as { token: string };
    expect((await handle(req('GET', '/v1/meta', { headers: asInbox(first.token) }), REMOTE)).status).toBe(401);
    expect((await handle(req('GET', '/v1/meta', { headers: asInbox(second.token) }), REMOTE)).status).toBe(200);
  });

  it('only accepts Slack incoming webhooks and https webhooks as alert targets', async () => {
    const put = (body: unknown) => handle(req('PUT', '/v1/admin/alerts', { headers: admin, body: JSON.stringify(body) }), REMOTE);
    expect((await put({ slack: 'https://evil.example/hook' })).status).toBe(400);
    expect((await put({ webhook: 'http://plain.example/hook' })).status).toBe(400);
    expect((await put({ slack: 'https://hooks.slack.com/services/T/B/x', webhook: 'https://hooks.example/grabby' })).status).toBe(200);
    const saved = await (await handle(req('GET', '/v1/admin/alerts', { headers: admin }), REMOTE)).json();
    expect(saved).toMatchObject({ slack: 'https://hooks.slack.com/services/T/B/x', webhook: 'https://hooks.example/grabby' });
    expect((await put({ slack: null })).status).toBe(200);
    expect(await storage.getSetting('alerts.slack')).toBeNull();
  });
});

describe('alerts', () => {
  let sent: Array<{ url: string; body: Record<string, unknown> }>;
  beforeEach(() => {
    sent = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('ok');
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends one message per burst, escaping reviewer text for Slack', async () => {
    const storage = new MemoryStorage();
    const work: Promise<unknown>[] = [];
    const handle = createHandler(config(), {
      storage, log: () => {}, alertDelayMs: 20, waitUntil: (p) => { work.push(p); },
      alerts: { slack: 'https://hooks.slack.com/services/T/B/x' }, publicUrl: 'https://collector.example/',
    });
    const post = (c: unknown) => handle(req('POST', '/v1/comments', {
      headers: { origin: SITE, 'x-grabby-key': PK, 'content-type': 'application/json' }, body: JSON.stringify({ comment: c }),
    }), REMOTE);
    await post({ ...incoming(), comment: 'Hey <!channel> & friends' });
    await post(incoming());
    await post(incoming());
    while (work.length) await Promise.all(work.splice(0));
    expect(sent).toHaveLength(1);
    const text = String(sent[0].body.text);
    expect(text).toContain('*3 new Grabby comments*');
    expect(text).toContain('&lt;!channel&gt; &amp; friends');
    expect(text).not.toContain('<!channel>');
    expect(text).toContain('https://collector.example/inbox#c=');

    await post(incoming());
    while (work.length) await Promise.all(work.splice(0));
    expect(sent).toHaveLength(2);
    expect(String(sent[1].body.text)).toContain('*1 new Grabby comment*');
  });

  it('never builds alert links from a forged Host header', async () => {
    const storage = new MemoryStorage();
    const work: Promise<unknown>[] = [];
    const handle = createHandler(config(), {
      storage, log: () => {}, alertDelayMs: 0, waitUntil: (p) => { work.push(p); },
      alerts: { slack: 'https://hooks.slack.com/services/T/B/x' },
    });
    const forged: Peer = { ip: '203.0.113.66', loopback: false, host: 'evil.example' };
    const postAs = (peer: Peer) => handle(req('POST', '/v1/comments', {
      headers: { origin: SITE, 'x-grabby-key': PK, 'content-type': 'application/json' }, body: JSON.stringify({ comment: incoming() }),
    }), peer);
    const settle = async () => { while (work.length) await Promise.all(work.splice(0)); };

    await postAs(forged);
    await settle();
    expect(String(sent[0].body.text)).not.toContain('evil.example');
    expect(String(sent[0].body.text)).not.toContain('<http');

    // Once an admin has reached the collector (share does this), links use that address.
    await handle(req('POST', '/v1/admin/inbox-token', { headers: { authorization: `Bearer ${SK}` } }), { ...REMOTE, host: 'feedback.shop.example' });
    await postAs(forged);
    await settle();
    expect(String(sent[1].body.text)).toContain('https://feedback.shop.example/inbox#c=');
    expect(String(sent[1].body.text)).not.toContain('evil.example');
  });

  it('posts a generic JSON payload to other webhooks', async () => {
    const storage = new MemoryStorage();
    await storage.setSetting('alerts.webhook', 'https://hooks.example/grabby');
    const work: Promise<unknown>[] = [];
    const handle = createHandler(config(), { storage, log: () => {}, alertDelayMs: 0, waitUntil: (p) => { work.push(p); } });
    await handle(req('POST', '/v1/comments', {
      headers: { origin: SITE, 'x-grabby-key': PK, 'content-type': 'application/json' }, body: JSON.stringify({ comment: incoming() }),
    }), REMOTE);
    while (work.length) await Promise.all(work.splice(0));
    expect(sent[0].url).toBe('https://hooks.example/grabby');
    expect(sent[0].body).toMatchObject({ type: 'grabby.comments', version: 1, count: 1, comments: [{ route: '/pricing', file: 'src/Buy.tsx', line: 3 }] });
  });
});

