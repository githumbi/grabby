import { authorLabel, estimateTokens, formatExport, type GrabbyComment } from '@githumbi/grabby/export';
import { clear, h } from './dom';

/*
 * The inbox: every comment reviewers left, with its screenshot, and one
 * button to copy them all for an AI agent. The private link carries its
 * token after '#', which browsers never send to servers or in Referer
 * headers; it moves to localStorage and leaves the address bar at once.
 */

type Status = 'open' | 'resolved' | 'all';
interface Comment extends GrabbyComment { receivedAt?: number }
interface Meta {
  projects: Array<{ publicKey: string; allowedOrigins: string[]; name: string }>;
  role: string;
  alerts: { slack: boolean; webhook: boolean };
}

const TOKEN_KEY = 'grabby.inbox.token';
const app = document.getElementById('app')!;
let token = '';
let status: Status = 'open';
let comments: Comment[] = [];
let meta: Meta | null = null;
let focusId: string | null = null;
let lastSignature = '';
const shotUrls = new Map<string, string>();

function readHash(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  const k = params.get('k');
  if (k && /^ik_[A-Za-z0-9_-]{16,64}$/.test(k)) {
    token = k;
    try { localStorage.setItem(TOKEN_KEY, k); } catch { /* private mode: keep it for this visit */ }
  }
  focusId = params.get('c');
  if (params.has('k')) history.replaceState(null, '', `${location.pathname}${focusId ? `#c=${encodeURIComponent(focusId)}` : ''}`);
  if (!token) {
    try { token = localStorage.getItem(TOKEN_KEY) ?? ''; } catch { token = ''; }
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    credentials: 'omit',
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (res.status === 401) {
    forget();
    throw new Error('locked');
  }
  return res;
}

function toast(message: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function forget(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  token = '';
  for (const url of shotUrls.values()) URL.revokeObjectURL(url);
  shotUrls.clear();
  renderLocked();
}

function renderLocked(): void {
  clear(app);
  app.appendChild(h('div', { class: 'locked' },
    h('h1', null, 'This inbox needs its private link'),
    h('p', null, 'Open the link Grabby printed when you ran share, or run this in your project to open it:'),
    h('p', null, h('code', null, 'npx @githumbi/grabby inbox')),
    h('p', null, 'If the link stopped working, it was reset. Run ', h('code', null, 'npx @githumbi/grabby share --rotate'), ' for a new one.'),
  ));
}

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function feedbackLink(): string | null {
  const project = meta?.projects[0];
  const site = project?.allowedOrigins.find((o) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(o)) ?? project?.allowedOrigins[0];
  return project && site ? `${site}/?grabby=${project.publicKey}` : null;
}

async function copy(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Copy failed: your browser blocked the clipboard');
  }
}

async function copyAll(): Promise<void> {
  const list = comments.filter((c) => status === 'all' || c.status === status);
  if (!list.length) return toast('Nothing to copy');
  // Screenshot links need the inbox token, so agents get them over MCP or `grabby pull` instead.
  const text = formatExport(list.map((c) => ({ ...c, screenshot: null })), 'standard', { showIds: true });
  await copy(text, `Copied ${list.length} comment${list.length === 1 ? '' : 's'} for your AI agent (~${estimateTokens(text).toLocaleString()} tokens)`);
}

async function setStatus(c: Comment, next: 'open' | 'resolved'): Promise<void> {
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
  if (!res.ok) return toast('Could not update the comment');
  c.status = next;
  render();
}

async function remove(c: Comment): Promise<void> {
  if (!confirm('Delete this comment and its screenshot? This cannot be undone.')) return;
  const res = await api(`/v1/comments/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
  if (!res.ok) return toast('Could not delete the comment');
  comments = comments.filter((x) => x.id !== c.id);
  render();
}

function lightbox(src: string, alt: string): void {
  const close = () => box.remove();
  const box = h('button', { class: 'lightbox', type: 'button', 'aria-label': 'Close screenshot', onClick: close }, h('img', { src, alt }));
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(box);
  box.focus();
}

function screenshot(c: Comment): HTMLElement {
  const holder = h('button', { class: 'shot', type: 'button', 'aria-label': 'Enlarge screenshot', disabled: !c.screenshot }, c.screenshot ? 'Loading…' : 'No screenshot');
  if (!c.screenshot) return holder;
  const show = (url: string) => {
    clear(holder);
    const alt = `Screenshot of the ${c.target.tag} this comment is about`;
    holder.appendChild(h('img', { src: url, alt, loading: 'lazy' }));
    holder.addEventListener('click', () => lightbox(url, alt));
  };
  const cached = shotUrls.get(c.id);
  if (cached) show(cached);
  else {
    // Fetched with the token, then shown from a blob: URL (CSP allows only 'self' and blob:).
    api(`/v1/screenshots/${encodeURIComponent(c.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        shotUrls.set(c.id, url);
        show(url);
      })
      .catch(() => { clear(holder); holder.appendChild(document.createTextNode('Screenshot unavailable')); });
  }
  return holder;
}

function card(c: Comment): HTMLElement {
  const src = c.target.source;
  const where = src?.file ? `${src.file}${src.line != null ? `:${src.line}` : ''}` : null;
  const el = h('article', { class: 'card', id: `c-${c.id}` },
    screenshot(c),
    h('div', { class: 'body' },
      h('div', { class: 'text' }, c.comment),
      h('div', { class: 'meta' },
        h('strong', null, authorLabel(c.author)),
        h('span', null, c.page.route || '/'),
        h('span', { title: new Date(c.createdAt).toLocaleString() }, timeAgo(c.createdAt)),
        c.status === 'resolved' && h('span', { class: 'status resolved' }, 'Resolved'),
      ),
      h('div', { class: 'target' },
        h('span', { class: 'chip' }, `${c.target.kind} · <${c.target.tag}>`),
        c.target.component && h('span', { class: 'chip' }, c.target.component),
        where && h('code', { class: 'chip', title: 'Source file' }, where),
      ),
      h('div', { class: 'actions' },
        c.status === 'open'
          ? h('button', { class: 'btn', type: 'button', onClick: () => setStatus(c, 'resolved') }, 'Mark resolved')
          : h('button', { class: 'btn', type: 'button', onClick: () => setStatus(c, 'open') }, 'Reopen'),
        h('button', { class: 'btn link', type: 'button', onClick: () => copy(formatExport([{ ...c, screenshot: null }], 'detailed', { showIds: true }), 'Copied this comment for your AI agent') }, 'Copy for AI'),
        h('button', { class: 'btn link danger', type: 'button', onClick: () => remove(c) }, 'Delete'),
      ),
    ),
  );
  return el;
}

function render(): void {
  clear(app);
  const counts = { open: 0, resolved: 0, all: comments.length };
  for (const c of comments) counts[c.status]++;
  const tab = (value: Status, label: string) => h('button', {
    type: 'button', 'aria-pressed': String(status === value),
    onClick: () => { status = value; render(); },
  }, `${label} ${counts[value]}`);
  const site = meta?.projects[0]?.allowedOrigins.find((o) => !/localhost|127\.0\.0\.1/.test(o));

  app.appendChild(h('header', null, h('div', { class: 'bar' },
    h('div', { class: 'brand' }, 'Grabby inbox', site && h('small', null, site.replace(/^https?:\/\//, ''))),
    h('div', { class: 'tabs', role: 'group', 'aria-label': 'Show' }, tab('open', 'Open'), tab('resolved', 'Resolved'), tab('all', 'All')),
    h('button', { class: 'btn primary', type: 'button', onClick: copyAll }, 'Copy all for AI'),
  )));

  const list = comments.filter((c) => status === 'all' || c.status === status).reverse();
  const main = h('main', null);
  if (!list.length) {
    const link = feedbackLink();
    main.appendChild(h('div', { class: 'empty' },
      h('h2', null, status === 'resolved' ? 'Nothing resolved yet' : 'No feedback yet'),
      h('p', null, status === 'resolved' ? 'Comments you mark resolved show up here.' : 'Send reviewers this link. They click Comment, pick anything on the page, and type. No account needed.'),
      link && status !== 'resolved' && h('div', { class: 'share' },
        h('code', null, link),
        h('button', { class: 'btn', type: 'button', onClick: () => copy(link, 'Feedback link copied') }, 'Copy link'),
      ),
    ));
  }
  for (const c of list) main.appendChild(card(c));
  app.appendChild(main);

  const link = feedbackLink();
  app.appendChild(h('footer', null,
    link && h('button', { class: 'btn link', type: 'button', onClick: () => copy(link, 'Feedback link copied') }, 'Copy feedback link'),
    h('span', null, meta?.alerts.slack || meta?.alerts.webhook ? 'Alerts: on' : 'Alerts: off (npx @githumbi/grabby alerts --slack <url>)'),
    h('button', { class: 'btn link', type: 'button', onClick: forget }, 'Forget this browser'),
  ));

  if (focusId) {
    const target = document.getElementById(`c-${focusId}`);
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.classList.add('flash');
      setTimeout(() => target.classList.remove('flash'), 2400);
      focusId = null;
    }
  }
}

async function load(): Promise<void> {
  try {
    const [metaRes, listRes] = await Promise.all([api('/v1/meta'), api('/v1/comments?status=all&limit=500')]);
    if (!metaRes.ok || !listRes.ok) throw new Error('load');
    meta = await metaRes.json() as Meta;
    const next = ((await listRes.json()) as { comments: Comment[] }).comments;
    // Auto-refresh only redraws when something changed, so the page doesn't jump.
    const signature = next.map((c) => `${c.id}:${c.status}:${c.updatedAt}:${c.screenshot ? 1 : 0}`).join();
    if (signature === lastSignature && app.querySelector('main')) return;
    lastSignature = signature;
    comments = next;
    if (focusId && comments.find((c) => c.id === focusId)?.status === 'resolved') status = 'all';
    render();
  } catch (err) {
    if ((err as Error).message !== 'locked' && !comments.length) {
      clear(app);
      app.appendChild(h('p', { class: 'boot' }, 'Could not load feedback. Check your connection and reload.'));
    }
  }
}

readHash();
if (token) void load();
else renderLocked();

window.addEventListener('hashchange', () => { readHash(); if (token) void load(); });
setInterval(() => { if (token && document.visibilityState === 'visible') void load(); }, 30_000);
