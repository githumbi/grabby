import { applyFilter, computeStats, type ListFilter, type StoredComment } from '../core/types';
import { mayUpdate, type ScreenshotMeta, type Storage } from '../core/storage';
import type { D1Database, D1PreparedStatement } from './d1';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL,
    session_id TEXT NOT NULL,
    route TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS comments_by_status ON comments (project_id, status, created_at)',
  'CREATE TABLE IF NOT EXISTS screenshots (id TEXT PRIMARY KEY, data BLOB NOT NULL)',
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
];

const MAX_COMMENTS = 10_000;
/** D1 allows at most 100 bound parameters per statement. */
const CHUNK = 90;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** D1 hands BLOBs back as ArrayBuffer or number[] depending on version; tests use Uint8Array. */
function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return null;
}

const changes = (r: { meta?: { changes?: number } }) => r.meta?.changes ?? 0;

/**
 * Comments in Cloudflare D1: strongly consistent (the screenshot upload
 * arrives milliseconds after its comment), 5 GB and 100k writes a day on the
 * free plan, and no card needed. The schema is created on first use.
 */
export class D1Storage implements Storage {
  private ready: Promise<void> | null = null;
  private inserts = 0;

  constructor(private readonly db: D1Database) {}

  private init(): Promise<void> {
    this.ready ??= this.db.batch(SCHEMA.map((sql) => this.db.prepare(sql))).then(() => undefined, (err) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  private async q(sql: string, ...values: unknown[]): Promise<D1PreparedStatement> {
    await this.init();
    return this.db.prepare(sql).bind(...values);
  }

  async list(filter: ListFilter = {}) {
    const where: string[] = [];
    const values: unknown[] = [];
    const status = filter.status ?? 'open';
    if (status !== 'all') { where.push('status = ?'); values.push(status); }
    if (filter.projectId) { where.push('project_id = ?'); values.push(filter.projectId); }
    if (filter.route) { where.push('route = ?'); values.push(filter.route); }
    if (filter.since) { where.push('received_at >= ?'); values.push(filter.since); }
    // Author matching needs the parsed row, so it widens the window.
    const limit = filter.author ? MAX_COMMENTS : Math.min(filter.limit ?? MAX_COMMENTS, MAX_COMMENTS);
    const sql = `SELECT data FROM comments${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`;
    const { results = [] } = await (await this.q(sql, ...values, limit)).all<{ data: string }>();
    return applyFilter(results.map((r) => JSON.parse(r.data) as StoredComment), filter);
  }

  async get(id: string) {
    const row = await (await this.q('SELECT data FROM comments WHERE id = ?', id)).first<{ data: string }>();
    return row ? JSON.parse(row.data) as StoredComment : undefined;
  }

  private async update(existing: StoredComment, comment: StoredComment): Promise<void> {
    const next = { ...existing, comment: comment.comment, updatedAt: comment.updatedAt, author: comment.author };
    await (await this.q('UPDATE comments SET data = ? WHERE id = ?', JSON.stringify(next), comment.id)).run();
  }

  async upsert(comment: StoredComment) {
    const existing = await this.get(comment.id);
    if (existing) {
      if (!mayUpdate(existing, comment)) return 'forbidden' as const;
      await this.update(existing, comment);
      return 'updated' as const;
    }
    const inserted = await (await this.q(
      `INSERT INTO comments (id, project_id, status, session_id, route, created_at, received_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      comment.id, comment.projectId, comment.status, comment.author.sessionId, comment.page.route,
      comment.createdAt, comment.receivedAt, JSON.stringify(comment),
    )).run();
    if (!changes(inserted)) {
      // A retry of the same comment raced us; treat it as that retry.
      const now = await this.get(comment.id);
      if (!now || !mayUpdate(now, comment)) return 'forbidden' as const;
      await this.update(now, comment);
      return 'updated' as const;
    }
    if (++this.inserts % 50 === 0) await this.trim();
    return 'created' as const;
  }

  /** Keeps the newest MAX_COMMENTS, dropping resolved ones first. */
  private async trim(): Promise<void> {
    const row = await (await this.q('SELECT COUNT(*) AS n FROM comments')).first<{ n: number }>();
    const excess = (row?.n ?? 0) - MAX_COMMENTS;
    if (excess <= 0) return;
    const { results = [] } = await (await this.q(
      "SELECT id FROM comments ORDER BY CASE status WHEN 'resolved' THEN 0 ELSE 1 END, received_at LIMIT ?", excess,
    )).all<{ id: string }>();
    await this.remove(results.map((r) => r.id));
  }

  async setStatus(ids: string[], status: 'open' | 'resolved') {
    let n = 0;
    const now = Date.now();
    for (const part of chunks([...new Set(ids)])) {
      const r = await (await this.q(
        `UPDATE comments SET status = ?, data = json_set(data, '$.status', ?, '$.updatedAt', ?)
         WHERE status != ? AND id IN (${part.map(() => '?').join(',')})`,
        status, status, now, status, ...part,
      )).run();
      n += changes(r);
    }
    return n;
  }

  async remove(ids: string[]) {
    let n = 0;
    for (const part of chunks([...new Set(ids)])) {
      const marks = part.map(() => '?').join(',');
      await this.init();
      const [removed] = await this.db.batch([
        this.db.prepare(`DELETE FROM comments WHERE id IN (${marks})`).bind(...part),
        this.db.prepare(`DELETE FROM screenshots WHERE id IN (${marks})`).bind(...part),
      ]);
      n += changes(removed);
    }
    return n;
  }

  async stats(projectId?: string) {
    return computeStats(await this.list({ status: 'all', projectId }));
  }

  async putScreenshot(id: string, data: Uint8Array, meta: ScreenshotMeta) {
    const comment = await this.get(id);
    if (!comment) return null;
    comment.screenshot = { url: `/v1/screenshots/${id}`, width: meta.width, height: meta.height };
    await this.init();
    await this.db.batch([
      this.db.prepare('INSERT INTO screenshots (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data').bind(id, data),
      this.db.prepare('UPDATE comments SET data = ? WHERE id = ?').bind(JSON.stringify(comment), id),
    ]);
    return comment;
  }

  async getScreenshot(id: string) {
    const row = await (await this.q('SELECT data FROM screenshots WHERE id = ?', id)).first<{ data: unknown }>();
    return row ? toBytes(row.data) : null;
  }

  async getSetting(key: string) {
    const row = await (await this.q('SELECT value FROM settings WHERE key = ?', key)).first<{ value: string }>();
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string | null) {
    if (value === null) await (await this.q('DELETE FROM settings WHERE key = ?', key)).run();
    else await (await this.q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value)).run();
  }

  async claimSetting(key: string, expected: string | null, next: string) {
    const r = expected === null
      ? await (await this.q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', key, next)).run()
      : await (await this.q('UPDATE settings SET value = ? WHERE key = ? AND value = ?', next, key, expected)).run();
    return changes(r) === 1;
  }
}
