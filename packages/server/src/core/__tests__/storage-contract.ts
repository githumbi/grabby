import { describe, it, expect, beforeEach } from 'vitest';
import type { Storage } from '../storage';
import { PNG, stored } from './fixtures';

/** Behaviour every storage backend must share. Run it with a fresh backend per test. */
export function storageContract(name: string, make: () => Promise<Storage> | Storage) {
  describe(`${name} storage`, () => {
    let s: Storage;
    beforeEach(async () => { s = await make(); });

    it('creates, then updates only from the same session and project', async () => {
      const c = stored();
      expect(await s.upsert(c)).toBe('created');
      expect(await s.upsert({ ...c, comment: 'edited', updatedAt: c.updatedAt + 1 })).toBe('updated');
      expect(await s.upsert({ ...c, author: { ...c.author, sessionId: 'sess_attacker0000' } })).toBe('forbidden');
      expect(await s.upsert({ ...c, projectId: 'other' })).toBe('forbidden');
      expect((await s.get(c.id))?.comment).toBe('edited');
    });

    it('lists by status, route, author and project, oldest first, limit keeping the newest', async () => {
      const a = stored({ createdAt: 1, page: { route: '/a', title: '', viewport: [1, 1] } });
      const b = stored({ createdAt: 2, author: { name: null, anonymous: true, sessionId: 'bbbb2222-x' } });
      const c = stored({ createdAt: 3, projectId: 'other' });
      for (const x of [c, a, b]) await s.upsert(x);
      await s.setStatus([c.id], 'resolved');
      expect((await s.list()).map((x) => x.id)).toEqual([a.id, b.id]);
      expect((await s.list({ status: 'all' })).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
      expect((await s.list({ status: 'resolved' })).map((x) => x.id)).toEqual([c.id]);
      expect((await s.list({ route: '/a' })).map((x) => x.id)).toEqual([a.id]);
      expect((await s.list({ author: 'jane', status: 'all' })).map((x) => x.id)).toEqual([a.id, c.id]);
      expect((await s.list({ author: 'bbbb' })).map((x) => x.id)).toEqual([b.id]);
      expect((await s.list({ projectId: 'other', status: 'all' })).map((x) => x.id)).toEqual([c.id]);
      expect((await s.list({ status: 'all', limit: 2 })).map((x) => x.id)).toEqual([b.id, c.id]);
    });

    it('changes status and deletes, counting only real changes', async () => {
      const a = stored();
      const b = stored();
      await s.upsert(a);
      await s.upsert(b);
      expect(await s.setStatus([a.id, 'cmt_missing_000'], 'resolved')).toBe(1);
      expect(await s.setStatus([a.id], 'resolved')).toBe(0);
      expect(await s.remove([b.id, 'cmt_missing_000'])).toBe(1);
      expect(await s.get(b.id)).toBeUndefined();
      const stats = await s.stats();
      expect(stats).toMatchObject({ total: 1, open: 0, resolved: 1 });
    });

    it('stores a screenshot on its comment, and drops it with the comment', async () => {
      const c = stored();
      expect(await s.putScreenshot(c.id, PNG, { type: 'image/png', ext: 'png', width: 10, height: 5 })).toBeNull();
      await s.upsert(c);
      const saved = await s.putScreenshot(c.id, PNG, { type: 'image/png', ext: 'png', width: 10, height: 5 });
      expect(saved?.screenshot).toEqual({ url: `/v1/screenshots/${c.id}`, width: 10, height: 5 });
      expect(Array.from((await s.getScreenshot(c.id)) ?? [])).toEqual(Array.from(PNG));
      await s.remove([c.id]);
      expect(await s.getScreenshot(c.id)).toBeNull();
    });

    it('keeps settings, and claims one only when it holds the expected value', async () => {
      expect(await s.getSetting('k')).toBeNull();
      expect(await s.claimSetting('k', null, 'one')).toBe(true);
      expect(await s.claimSetting('k', null, 'two')).toBe(false);
      expect(await s.claimSetting('k', 'one', 'two')).toBe(true);
      expect(await s.getSetting('k')).toBe('two');
      await s.setSetting('k', null);
      expect(await s.getSetting('k')).toBeNull();
    });
  });
}
