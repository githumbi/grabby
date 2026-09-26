import type { GrabbyComment, DetailLevel, CommentAuthor } from '../types';

export interface ExportEnv {
  /** Page origin shown in the header, e.g. "localhost:4200". */
  origin?: string;
  now?: Date;
  /** Print each comment's id, so an agent can act on it (e.g. resolve it). */
  showIds?: boolean;
}

/** Rough token count (≈4 characters per token), for the Copy dialog. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const STYLE_FACTS = new Set(['styles', 'layout', 'computed']);
/** Facts that are often already visible in the preview; skipped when they are. */
const PREVIEW_FACTS = new Set(['label', 'type', 'text', 'href', 'placeholder', 'alt', 'src', 'title']);

function inPreview(preview: string, value: string): boolean {
  return value.length > 0 && (preview.includes(`>${value}<`) || preview.includes(`"${value}"`) || preview.includes(`>${value}`));
}

function authorKey(a: CommentAuthor): string {
  return a.anonymous || !a.name ? `anon:${a.sessionId}` : `name:${a.name}`;
}

export function authorLabel(a: CommentAuthor): string {
  if (!a.anonymous && a.name) return a.name;
  return `Anonymous ${a.sessionId.replace(/-/g, '').slice(0, 4)}`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function location(file: string, line: number | null, full: boolean): string {
  const name = full ? file : basename(file);
  return line != null ? `${name}:${line}` : name;
}

function indent(text: string, pad: string): string {
  return text.split('\n').map((l, i) => (i === 0 ? l : `${pad}${l}`)).join('\n');
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

interface Context {
  showAuthors: boolean;
  showRoutes: boolean;
  showIds: boolean;
  level: DetailLevel;
}

function header(comments: GrabbyComment[], env: ExportEnv, ctx: Context): string[] {
  const n = comments.length;
  const lines = [`# UI feedback · ${n} comment${n === 1 ? '' : 's'}`];
  const meta: string[] = [];
  if (env.origin) meta.push(env.origin);
  const frameworks = uniq(comments.map((c) => c.framework).filter(Boolean));
  if (frameworks.length) meta.push(frameworks.join(', '));
  const routes = uniq(comments.map((c) => c.page.route));
  if (!ctx.showRoutes && routes.length === 1) meta.push(`page ${routes[0]}`);
  const vp = comments[0]?.page.viewport;
  if (vp) meta.push(`${vp[0]}×${vp[1]}`);
  meta.push((env.now ?? new Date()).toISOString().slice(0, 10));
  lines.push(meta.join(' · '));
  if (ctx.showAuthors) {
    const people = uniq(comments.map((c) => authorLabel(c.author)));
    lines.push(`From: ${people.join(', ')}`);
  }
  return lines;
}

function compactLine(c: GrabbyComment, i: number, ctx: Context): string {
  const t = c.target;
  const where = t.source ? location(t.source.file, t.source.line, true) : t.selector;
  const parts = [where, t.component, `<${t.tag}>`].filter(Boolean).join(' ');
  const who = ctx.showAuthors ? ` (${authorLabel(c.author)})` : '';
  const route = ctx.showRoutes ? ` [${c.page.route}]` : '';
  const id = ctx.showIds ? ` [id ${c.id}]` : '';
  return `${i}. ${parts}${route} — ${indent(c.comment, '   ')}${who}${id}`;
}

function detailBlock(c: GrabbyComment, i: number, ctx: Context, groupHasSource: boolean, headedComponent: string | null): string[] {
  const t = c.target;
  const full = ctx.level === 'detailed';
  const lines = [`${i}. ${indent(c.comment, '   ')}`];
  const b = (text: string) => lines.push(`   - ${text}`);

  const where: string[] = [`\`${t.preview}\``, `(${t.kind})`];
  if (t.component && t.component !== headedComponent) {
    where.push(t.source?.line != null && groupHasSource ? `${t.component} line ${t.source.line}` : t.component);
  } else if (t.source?.line != null && groupHasSource) {
    where.push(`line ${t.source.line}`);
  }
  b(where.join(' '));

  // A selector is only worth tokens when there's no file to point at.
  if (!t.source || full) b(`selector: \`${t.selector}\``);

  const plain = Object.entries(t.facts)
    .filter(([k, v]) => !STYLE_FACTS.has(k) && !(PREVIEW_FACTS.has(k) && !full && inPreview(t.preview, v)));
  if (plain.length) b(plain.map(([k, v]) => `${k}: ${v}`).join(' · '));
  for (const [k, v] of Object.entries(t.facts)) if (STYLE_FACTS.has(k)) b(`${k}: ${v}`);

  // The first frame is the element's own component; it's already named above.
  const parents = t.stack.filter((f, i) => !(i === 0 && (t.source || f.name === t.component)));
  if (parents.length) {
    b(`inside: ${parents.map((f) => (f.file ? `${f.name} (${location(f.file, f.line, full)})` : f.name)).join(' › ')}`);
  }

  if (full) {
    for (const [k, v] of Object.entries(t.extra)) b(`${k}: ${v}`);
    b(`viewport: ${c.page.viewport[0]}×${c.page.viewport[1]}`);
  }

  if (c.screenshot?.url) b(`screenshot: ${c.screenshot.url}`);

  const meta: string[] = [];
  if (ctx.showAuthors) meta.push(`by ${authorLabel(c.author)}`);
  if (ctx.showRoutes) meta.push(`on ${c.page.route}`);
  if (meta.length) b(meta.join(' '));
  if (ctx.showIds) b(`id: ${c.id}`);
  return lines;
}

/**
 * Turns comments into text for an AI agent. Page-level context is said once
 * in the header, comments are grouped by the file they point at, and only the
 * facts that matter for each element's kind are included.
 */
export function formatExport(comments: GrabbyComment[], level: DetailLevel = 'standard', env: ExportEnv = {}): string {
  if (comments.length === 0) return '';
  const ordered = [...comments].sort((a, b) => a.createdAt - b.createdAt);
  const authors = uniq(ordered.map((c) => authorKey(c.author)));
  const ctx: Context = {
    level,
    showIds: env.showIds === true,
    showAuthors: authors.length > 1 || ordered.some((c) => !c.author.anonymous && !!c.author.name),
    showRoutes: uniq(ordered.map((c) => c.page.route)).length > 1,
  };

  const out = header(ordered, env, ctx);

  if (level === 'compact') {
    out.push('');
    ordered.forEach((c, idx) => out.push(compactLine(c, idx + 1, ctx)));
    return out.join('\n');
  }

  // Group by file so an agent handles each file once; keep first-seen order.
  const groups = new Map<string, GrabbyComment[]>();
  for (const c of ordered) {
    const key = c.target.source?.file ?? '';
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  let n = 0;
  for (const [file, list] of groups) {
    out.push('');
    const components = uniq(list.map((c) => c.target.component));
    const headed = file && components.length === 1 ? components[0] : null;
    const lines = uniq(list.map((c) => c.target.source?.line ?? null));
    if (file) {
      const loc = lines.length === 1 ? location(file, lines[0], true) : file;
      out.push(`## ${loc}${headed ? ` · ${headed}` : ''}`);
    } else {
      out.push('## Elements without source info');
    }
    for (const c of list) {
      n += 1;
      out.push(...detailBlock(c, n, ctx, !!file && lines.length > 1, headed));
    }
  }
  return out.join('\n');
}
