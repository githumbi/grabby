import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import worker, { type WorkerEnv } from '../index';
import { sqliteD1 } from './sqlite-d1';
import { PK, SITE, SK, WEBP, incoming } from '../../core/__tests__/fixtures';

const [major, minor] = process.versions.node.split('.').map(Number);
const hasSqlite = major > 22 || (major === 22 && minor >= 5);
const ctx = { waitUntil: () => {} };

describe.skipIf(!hasSqlite)('worker', () => {
  it('fails closed until it has keys, origins and a database', async () => {
    const res = await worker.fetch(new Request('https://g.example.workers.dev/v1/comments', { method: 'POST' }), { DB: await sqliteD1() }, ctx);
    expect(res.status).toBe(503);
    const health = await worker.fetch(new Request('https://g.example.workers.dev/health'), {}, ctx);
    expect(await health.json()).toMatchObject({ configured: false });
  });

  it('collects a comment and its screenshot end to end', async () => {
    const env: WorkerEnv = { DB: await sqliteD1(), GRABBY_PUBLIC_KEY: PK, GRABBY_ADMIN_TOKEN: SK, GRABBY_ALLOWED_ORIGINS: SITE };
    const c = incoming();
    const posted = await worker.fetch(new Request('https://g.example.workers.dev/v1/comments', {
      method: 'POST', headers: { origin: SITE, 'x-grabby-key': PK, 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.1' },
      body: JSON.stringify({ comment: c }),
    }), env, ctx);
    expect(posted.status).toBe(201);
    const shot = await worker.fetch(new Request(`https://g.example.workers.dev/v1/comments/${c.id}/screenshot?w=3&h=2`, {
      method: 'PUT', headers: { origin: SITE, 'x-grabby-key': PK, 'x-grabby-session': c.author.sessionId }, body: WEBP,
    }), env, ctx);
    expect(shot.status).toBe(200);
    const list = await worker.fetch(new Request('https://g.example.workers.dev/v1/comments', { headers: { authorization: `Bearer ${SK}` } }), env, ctx);
    const { comments } = await list.json() as { comments: Array<{ id: string; screenshot: unknown }> };
    expect(comments).toHaveLength(1);
    expect(comments[0].screenshot).toMatchObject({ width: 3, height: 2 });
    const img = await worker.fetch(new Request(`https://g.example.workers.dev/v1/screenshots/${c.id}`, { headers: { authorization: `Bearer ${SK}` } }), env, ctx);
    expect(img.headers.get('content-type')).toBe('image/webp');
  });
});

describe('worker bundle', () => {
  const file = new URL('../../../dist/worker/worker.js', import.meta.url);
  it.skipIf(!existsSync(file))('is self-contained, with no Node built-ins', () => {
    const code = readFileSync(file, 'utf8');
    expect(code).not.toMatch(/["']node:/);
    expect(code).not.toMatch(/\brequire\(/);
  });
});
