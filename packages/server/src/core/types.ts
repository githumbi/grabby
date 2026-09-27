import type { GrabbyComment } from '@githumbi/grabby/export';

export interface StoredComment extends GrabbyComment {
  projectId: string;
  receivedAt: number;
  /** Site the comment came from, as sent by the browser. */
  origin: string | null;
  /** File name under screenshots/ (file storage only). */
  screenshotFile?: string;
}

export interface ListFilter {
  status?: 'open' | 'resolved' | 'all';
  author?: string;
  route?: string;
  since?: number;
  projectId?: string;
  limit?: number;
}

export interface CommentStats {
  total: number;
  open: number;
  resolved: number;
  byAuthor: Record<string, number>;
  byRoute: Record<string, number>;
}

export function matchesFilter(c: StoredComment, filter: ListFilter): boolean {
  const status = filter.status ?? 'open';
  return (status === 'all' || c.status === status)
    && (!filter.projectId || c.projectId === filter.projectId)
    && (!filter.since || c.receivedAt >= filter.since)
    && (!filter.route || c.page.route === filter.route)
    && (!filter.author || (c.author.name ?? '').toLowerCase() === filter.author.toLowerCase() || c.author.sessionId.startsWith(filter.author));
}

/** Oldest first; `limit` keeps the newest. */
export function applyFilter(comments: StoredComment[], filter: ListFilter = {}): StoredComment[] {
  const out = comments.filter((c) => matchesFilter(c, filter)).sort((a, b) => a.createdAt - b.createdAt);
  return filter.limit ? out.slice(-filter.limit) : out;
}

export function computeStats(comments: StoredComment[]): CommentStats {
  const stats: CommentStats = { total: comments.length, open: 0, resolved: 0, byAuthor: {}, byRoute: {} };
  for (const c of comments) {
    stats[c.status]++;
    const who = !c.author.anonymous && c.author.name ? c.author.name : `Anonymous ${c.author.sessionId.replace(/-/g, '').slice(0, 4)}`;
    stats.byAuthor[who] = (stats.byAuthor[who] ?? 0) + 1;
    stats.byRoute[c.page.route] = (stats.byRoute[c.page.route] ?? 0) + 1;
  }
  return stats;
}
