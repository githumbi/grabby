import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import type { CommentStore } from '../store';
import type { ListFilter, StoredComment } from '../core/types';
import type { ScreenshotMeta, Storage } from '../core/storage';

/**
 * The JSON-file store behind the async Storage interface, plus a small
 * settings.json (inbox token hash, alert URLs) next to comments.json.
 */
export class FileStorage implements Storage {
  private readonly settingsFile: string;
  private settings: Record<string, string> | null = null;

  constructor(readonly store: CommentStore) {
    this.settingsFile = path.join(store.dataDir, 'settings.json');
  }

  async list(filter?: ListFilter) { return this.store.list(filter); }
  async get(id: string) { return this.store.get(id); }
  upsert(comment: StoredComment) { return this.store.upsert(comment); }
  setStatus(ids: string[], status: 'open' | 'resolved') { return this.store.setStatus(ids, status); }
  remove(ids: string[]) { return this.store.remove(ids); }
  async stats(projectId?: string) { return this.store.stats(projectId); }

  putScreenshot(id: string, data: Uint8Array, meta: ScreenshotMeta) {
    return this.store.saveScreenshot(id, Buffer.from(data.buffer, data.byteOffset, data.byteLength), meta.ext, meta.width, meta.height);
  }

  async getScreenshot(id: string) {
    const c = this.store.get(id);
    return c ? this.store.readScreenshot(c) : null;
  }

  private load(): Record<string, string> {
    if (!this.settings) {
      try {
        const parsed = JSON.parse(readFileSync(this.settingsFile, 'utf8')) as unknown;
        this.settings = parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
      } catch {
        this.settings = {};
      }
    }
    return this.settings;
  }

  private save(): void {
    const tmp = `${this.settingsFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(this.settings, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.settingsFile);
  }

  async getSetting(key: string) {
    return this.load()[key] ?? null;
  }

  async setSetting(key: string, value: string | null) {
    const s = this.load();
    if (value === null) delete s[key];
    else s[key] = value;
    this.save();
  }

  // Node is single-threaded and these calls are synchronous, so check-and-set is atomic.
  async claimSetting(key: string, expected: string | null, next: string) {
    const s = this.load();
    if ((s[key] ?? null) !== expected) return false;
    s[key] = next;
    this.save();
    return true;
  }
}
