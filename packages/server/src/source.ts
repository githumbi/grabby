import type { CommentStore, StoredComment, ListFilter } from './store';

export type SourceComment = Omit<StoredComment, 'screenshotFile'>;

/** Where MCP tools and `pull` read comments from: this machine, or a deployed server. */
export interface CommentSource {
  describe(): string;
  list(filter?: ListFilter): Promise<SourceComment[]>;
  get(id: string): Promise<SourceComment | null>;
  screenshot(id: string): Promise<{ data: Buffer; type: string } | null>;
  setStatus(ids: string[], status: 'open' | 'resolved'): Promise<number>;
  remove(ids: string[]): Promise<number>;
  stats(): Promise<unknown>;
}

export class LocalSource implements CommentSource {
  /**
   * @param reload re-read the file before each read. Needed when another
   * process (a separate collector) writes the data dir; never when this
   * process owns the collector, since a reload could drop a pending write.
   */
  constructor(private readonly store: CommentStore, private readonly reload = false) {}

  private refresh(): void {
    if (this.reload) this.store.reload();
  }

  describe(): string {
    return `local data in ${this.store.dataDir}`;
  }

  async list(filter?: ListFilter) {
    this.refresh();
    return this.store.list(filter);
  }

  async get(id: string) {
    this.refresh();
    return this.store.get(id) ?? null;
  }

  async screenshot(id: string) {
    const c = this.store.get(id);
    const data = c ? await this.store.readScreenshot(c) : null;
    if (!data || !c?.screenshotFile) return null;
    const ext = c.screenshotFile.split('.').pop();
    return { data, type: ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'image/webp' };
  }

  /** Absolute path of a comment's screenshot, which local agents can open directly. */
  screenshotPath(id: string): string | null {
    const c = this.store.get(id);
    return c ? this.store.screenshotPath(c) : null;
  }

  setStatus(ids: string[], status: 'open' | 'resolved') {
    return this.store.setStatus(ids, status);
  }

  remove(ids: string[]) {
    return this.store.remove(ids);
  }

  async stats() {
    this.refresh();
    return this.store.stats();
  }
}

export class RemoteSource implements CommentSource {
  private readonly base: string;

  constructor(serverUrl: string, private readonly token: string) {
    this.base = serverUrl.replace(/\/+$/, '');
  }

  describe(): string {
    return this.base;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...init.headers,
      },
    });
    if (res.status === 401) throw new Error(`${this.base} rejected the admin token (set --token or GRABBY_ADMIN_TOKEN)`);
    return res;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.request(path, init);
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async list(filter: ListFilter = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) if (v !== undefined) qs.set(k === 'projectId' ? 'project' : k, String(v));
    const { comments } = await this.json<{ comments: SourceComment[] }>(`/v1/comments?${qs}`);
    return comments;
  }

  async get(id: string) {
    const res = await this.request(`/v1/comments/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET comment failed: ${res.status}`);
    return ((await res.json()) as { comment: SourceComment }).comment;
  }

  async screenshot(id: string) {
    const res = await this.request(`/v1/screenshots/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return { data: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') ?? 'image/webp' };
  }

  async setStatus(ids: string[], status: 'open' | 'resolved') {
    if (ids.length === 0) return 0;
    const r = await this.json<{ changed: number }>('/v1/comments/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action: status === 'resolved' ? 'resolve' : 'reopen' }),
    });
    return r.changed;
  }

  async remove(ids: string[]) {
    if (ids.length === 0) return 0;
    const r = await this.json<{ changed: number }>('/v1/comments/bulk', { method: 'POST', body: JSON.stringify({ ids, action: 'delete' }) });
    return r.changed;
  }

  async stats() {
    const all = await this.list({ status: 'all', limit: 1000 });
    return {
      total: all.length,
      open: all.filter((c) => c.status === 'open').length,
      resolved: all.filter((c) => c.status === 'resolved').length,
    };
  }
}
