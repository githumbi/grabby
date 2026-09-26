// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOutbox, type SyncState } from '../sync/outbox';
import { makeComment } from './fixtures';
import type { GrabbyComment } from '../types';

describe('outbox', () => {
  let calls: Array<{ url: string; method: string; headers: Record<string, string> }>;
  let respond: (url: string) => number;

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    respond = () => 201;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string> });
      const status = respond(url);
      return new Response(status < 300 ? '{}' : 'nope', { status });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function setup(comment: GrabbyComment) {
    let current = comment;
    const states: SyncState[] = [];
    const outbox = createOutbox({
      server: 'https://feedback.test/',
      projectKey: 'pk_x',
      getComment: (id) => (id === current.id ? current : undefined),
      getScreenshot: async () => new Blob(['img'], { type: 'image/webp' }),
      onState: (_id, s) => states.push(s),
    });
    return { outbox, states, update: (c: GrabbyComment) => { current = c; } };
  }

  const flush = () => new Promise((r) => setTimeout(r, 30));

  it('sends the comment with the project key, then its screenshot with the session', async () => {
    const c = makeComment({ screenshot: { localId: 'x', width: 10, height: 5 } });
    const { outbox, states } = setup(c);
    outbox.send(c.id);
    await flush(); await flush();
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'POST https://feedback.test/v1/comments',
      `PUT https://feedback.test/v1/comments/${c.id}/screenshot?w=10&h=5`,
    ]);
    expect(calls[0].headers['X-Grabby-Key']).toBe('pk_x');
    expect(calls[1].headers['X-Grabby-Session']).toBe(c.author.sessionId);
    expect(states).toEqual(['sent']);
    outbox.dispose();
  });

  it('uploads a screenshot that finished while the comment was in flight', async () => {
    const c = makeComment();
    const { outbox, update } = setup(c);
    respond = (url) => {
      // The screenshot lands mid-request, as it does in the browser.
      if (url.endsWith('/v1/comments')) update({ ...c, screenshot: { localId: 'late', width: 1, height: 1 } });
      return 201;
    };
    outbox.send(c.id);
    outbox.sendScreenshot(c.id); // skipped: the comment job is still queued
    await flush(); await flush();
    expect(calls.some((x) => x.method === 'PUT')).toBe(true);
    outbox.dispose();
  });

  it('keeps retrying server errors, persists the queue, and gives up on a 4xx', async () => {
    const c = makeComment();
    respond = () => 503;
    const { outbox, states } = setup(c);
    outbox.send(c.id);
    await flush();
    expect(states).toEqual(['pending']);
    expect(JSON.parse(localStorage.getItem('grabby:v1:outbox')!)[0]).toMatchObject({ id: c.id, attempts: 1 });
    outbox.dispose();

    respond = () => 403;
    const second = setup(c); // a fresh page picks up the saved queue
    await new Promise((r) => setTimeout(r, 600));
    expect(second.states).toEqual(['failed']);
    expect(localStorage.getItem('grabby:v1:outbox')).toBeNull();
    second.outbox.dispose();
  });
});
