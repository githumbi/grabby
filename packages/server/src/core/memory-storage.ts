import { applyFilter, computeStats, type ListFilter, type StoredComment } from './types';
import { mayUpdate, type ScreenshotMeta, type Storage } from './storage';

/** In-memory storage for tests, and the reference for the other backends. */
export class MemoryStorage implements Storage {
  private comments = new Map<string, StoredComment>();
  private shots = new Map<string, Uint8Array>();
  private settings = new Map<string, string>();

  async list(filter: ListFilter = {}) {
    return applyFilter([...this.comments.values()], filter).map((c) => structuredClone(c));
  }

  async get(id: string) {
    const c = this.comments.get(id);
    return c && structuredClone(c);
  }

  async upsert(comment: StoredComment) {
    const existing = this.comments.get(comment.id);
    if (existing) {
      if (!mayUpdate(existing, comment)) return 'forbidden' as const;
      Object.assign(existing, { comment: comment.comment, updatedAt: comment.updatedAt, author: comment.author });
      return 'updated' as const;
    }
    this.comments.set(comment.id, structuredClone(comment));
    return 'created' as const;
  }

  async setStatus(ids: string[], status: 'open' | 'resolved') {
    let n = 0;
    for (const id of ids) {
      const c = this.comments.get(id);
      if (c && c.status !== status) {
        c.status = status;
        c.updatedAt = Date.now();
        n++;
      }
    }
    return n;
  }

  async remove(ids: string[]) {
    let n = 0;
    for (const id of ids) {
      if (this.comments.delete(id)) n++;
      this.shots.delete(id);
    }
    return n;
  }

  async stats(projectId?: string) {
    return computeStats([...this.comments.values()].filter((c) => !projectId || c.projectId === projectId));
  }

  async putScreenshot(id: string, data: Uint8Array, meta: ScreenshotMeta) {
    const c = this.comments.get(id);
    if (!c) return null;
    this.shots.set(id, data.slice());
    c.screenshot = { url: `/v1/screenshots/${id}`, width: meta.width, height: meta.height };
    return structuredClone(c);
  }

  async getScreenshot(id: string) {
    return this.shots.get(id) ?? null;
  }

  async getSetting(key: string) {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string | null) {
    if (value === null) this.settings.delete(key);
    else this.settings.set(key, value);
  }

  async claimSetting(key: string, expected: string | null, next: string) {
    if ((this.settings.get(key) ?? null) !== expected) return false;
    this.settings.set(key, next);
    return true;
  }
}
