import { mkdirSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { writeFile, rename, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { applyFilter, computeStats, type ListFilter, type StoredComment } from './core/types';
import { mayUpdate } from './core/storage';

export type { ListFilter, StoredComment } from './core/types';

const MAX_COMMENTS = 10_000;

/**
 * A JSON file, rewritten atomically (temp file + rename) on every change and
 * with writes serialised, so a crash can't leave a half-written file. It has
 * no native dependencies, so `npx` and any container image just work. At
 * feedback volumes (thousands of comments, not millions) that's plenty.
 */
export class CommentStore {
  readonly dataDir: string;
  readonly shotsDir: string;
  private readonly file: string;
  private comments: StoredComment[] = [];
  private writing: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.shotsDir = path.join(dataDir, 'screenshots');
    this.file = path.join(dataDir, 'comments.json');
    mkdirSync(this.shotsDir, { recursive: true });
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { comments?: StoredComment[] };
      this.comments = Array.isArray(parsed.comments) ? parsed.comments : [];
    } catch {
      // Keep the unreadable file for inspection rather than overwriting it.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      try { renameSync(this.file, backup); } catch { /* ignore */ }
      this.comments = [];
    }
  }

  /** Re-reads the file; used by processes that share a data dir. */
  reload(): void {
    this.load();
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify({ version: 1, comments: this.comments });
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.file);
    }).catch((err) => {
      console.error('[grabby] failed to save comments:', (err as Error).message);
    });
    return this.writing;
  }

  list(filter: ListFilter = {}): StoredComment[] {
    return applyFilter(this.comments, filter);
  }

  get(id: string): StoredComment | undefined {
    return this.comments.find((c) => c.id === id);
  }

  /**
   * Inserts or updates by id. The browser's outbox retries, so the same
   * comment can arrive twice; an update is only accepted from the session
   * that created it.
   */
  async upsert(comment: StoredComment): Promise<'created' | 'updated' | 'forbidden'> {
    const existing = this.get(comment.id);
    if (existing) {
      if (!mayUpdate(existing, comment)) return 'forbidden';
      Object.assign(existing, {
        comment: comment.comment,
        updatedAt: comment.updatedAt,
        author: comment.author,
      });
      await this.persist();
      return 'updated';
    }
    this.comments.push(comment);
    this.trim();
    await this.persist();
    return 'created';
  }

  private trim(): void {
    if (this.comments.length <= MAX_COMMENTS) return;
    // Drop the oldest resolved comments first, then the oldest open ones.
    const excess = this.comments.length - MAX_COMMENTS;
    const byAge = [...this.comments].sort((a, b) =>
      (a.status === b.status ? 0 : a.status === 'resolved' ? -1 : 1) || a.receivedAt - b.receivedAt);
    const drop = new Set(byAge.slice(0, excess).map((c) => c.id));
    for (const c of this.comments) if (drop.has(c.id) && c.screenshotFile) void this.deleteShot(c.screenshotFile);
    this.comments = this.comments.filter((c) => !drop.has(c.id));
  }

  async setStatus(ids: string[], status: 'open' | 'resolved'): Promise<number> {
    const wanted = new Set(ids);
    let n = 0;
    for (const c of this.comments) {
      if (wanted.has(c.id) && c.status !== status) {
        c.status = status;
        c.updatedAt = Date.now();
        n++;
      }
    }
    if (n) await this.persist();
    return n;
  }

  async remove(ids: string[]): Promise<number> {
    const wanted = new Set(ids);
    const removed = this.comments.filter((c) => wanted.has(c.id));
    this.comments = this.comments.filter((c) => !wanted.has(c.id));
    for (const c of removed) if (c.screenshotFile) await this.deleteShot(c.screenshotFile);
    if (removed.length) await this.persist();
    return removed.length;
  }

  async saveScreenshot(id: string, data: Buffer, ext: string, width: number, height: number): Promise<StoredComment | null> {
    const comment = this.get(id);
    if (!comment) return null;
    const name = `${id}.${ext}`;
    if (comment.screenshotFile && comment.screenshotFile !== name) await this.deleteShot(comment.screenshotFile);
    await writeFile(path.join(this.shotsDir, name), data, { mode: 0o600 });
    comment.screenshotFile = name;
    comment.screenshot = { url: `/v1/screenshots/${id}`, width, height };
    await this.persist();
    return comment;
  }

  screenshotPath(comment: StoredComment): string | null {
    return comment.screenshotFile ? path.join(this.shotsDir, comment.screenshotFile) : null;
  }

  async readScreenshot(comment: StoredComment): Promise<Buffer | null> {
    const file = this.screenshotPath(comment);
    if (!file) return null;
    try { return await readFile(file); } catch { return null; }
  }

  private async deleteShot(name: string): Promise<void> {
    // Names are always `${id}.${ext}` built by us; basename guards anyway.
    try { await unlink(path.join(this.shotsDir, path.basename(name))); } catch { /* already gone */ }
  }

  stats(projectId?: string) {
    return computeStats(this.comments.filter((c) => !projectId || c.projectId === projectId));
  }
}
