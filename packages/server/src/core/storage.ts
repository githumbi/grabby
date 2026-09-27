import type { CommentStats, ListFilter, StoredComment } from './types';

export interface ScreenshotMeta {
  type: string;
  ext: string;
  width: number;
  height: number;
}

/**
 * Where a collector keeps comments, screenshots and a few settings. Every
 * method is async so the same handler works over a JSON file (Node) or a
 * database (Cloudflare D1).
 */
export interface Storage {
  list(filter?: ListFilter): Promise<StoredComment[]>;
  get(id: string): Promise<StoredComment | undefined>;
  /**
   * Inserts or updates by id. The browser's outbox retries, so the same
   * comment can arrive twice; an update is only accepted from the session
   * (and project) that created it.
   */
  upsert(comment: StoredComment): Promise<'created' | 'updated' | 'forbidden'>;
  setStatus(ids: string[], status: 'open' | 'resolved'): Promise<number>;
  remove(ids: string[]): Promise<number>;
  stats(projectId?: string): Promise<CommentStats>;

  /** Saves the image and records it on the comment; null when the comment is gone. */
  putScreenshot(id: string, data: Uint8Array, meta: ScreenshotMeta): Promise<StoredComment | null>;
  getScreenshot(id: string): Promise<Uint8Array | null>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string | null): Promise<void>;
  /** Sets `key` to `next` only if it currently equals `expected` (null = unset). */
  claimSetting(key: string, expected: string | null, next: string): Promise<boolean>;
}

/** The session and project that wrote a comment are the only ones that may change it. */
export function mayUpdate(existing: StoredComment, incoming: StoredComment): boolean {
  return existing.author.sessionId === incoming.author.sessionId && existing.projectId === incoming.projectId;
}
