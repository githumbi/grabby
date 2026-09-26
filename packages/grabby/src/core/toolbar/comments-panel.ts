import type { GrabbyComment } from '../types';
import { addStyles, removeStyles, getUiRoot } from '../ui/root';
import { h, svgIcon } from '../ui/dom';
import { safeQuery } from '../utils';
import { authorLabel } from '../capture/export';
import { getScreenshot } from '../storage/screenshot-store';
import { ICON_DISMISS } from './toolbar-icons';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const PANEL_ID = '__grabby-comments__';
const STYLE_ID = 'comments-panel';

export interface CommentsPanel {
  show(comments: GrabbyComment[]): void;
  /** Re-renders with fresh data if the panel is open. */
  refresh(comments: GrabbyComment[]): void;
  hide(): void;
  isVisible(): boolean;
  isPanelElement(el: Element): boolean;
  dispose(): void;
}

export interface CommentsPanelCallbacks {
  onEdit: (comment: GrabbyComment, rowEl: HTMLElement) => void;
  onHover: (comment: GrabbyComment | null) => void;
  onDelete: (comment: GrabbyComment) => void;
  onCopyAll: () => void;
  onClearAll: () => void;
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function vsCodeUri(file: string, line: number | null, column: number | null): string {
  let uri = `vscode://file/${encodeURI(file)}`;
  if (line != null) uri += `:${line}`;
  if (line != null && column != null) uri += `:${column}`;
  return uri;
}

const CSS = `
  #${PANEL_ID} {
    position: fixed;
    bottom: ${TOOLBAR_POPOVER_OFFSET};
    left: 50%;
    transform: translateX(-50%);
    z-index: ${Z_INDEX_POPOVER};
    width: min(420px, calc(100vw - 32px));
    max-height: min(440px, calc(100vh - 120px));
    display: flex;
    flex-direction: column;
    background: var(--grabby-popover-bg, #fff);
    color: var(--grabby-popover-text, #334155);
    border: 1px solid var(--grabby-popover-border, #e2e8f0);
    border-radius: 12px;
    box-shadow: 0 8px 24px var(--grabby-popover-shadow, rgba(0,0,0,.12));
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    opacity: 0;
    visibility: hidden;
    transition: opacity .15s ease, visibility .15s ease;
  }
  #${PANEL_ID}.grabby-popover-visible { opacity: 1; visibility: visible; }
  .grabby-panel-header {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid var(--grabby-popover-border, #e2e8f0);
  }
  .grabby-panel-title { font-weight: 600; font-size: 13px; }
  .grabby-panel-count { color: var(--grabby-text-muted, #94a3b8); font-weight: 500; margin-left: 4px; }
  .grabby-btn {
    font: 600 12px/1 inherit; font-family: inherit;
    padding: 7px 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--grabby-popover-border, #e2e8f0);
    background: transparent; color: var(--grabby-popover-text, #334155);
  }
  .grabby-btn:hover { background: var(--grabby-popover-hover, #f1f5f9); }
  .grabby-btn-primary { background: var(--grabby-accent, #2563eb); border-color: var(--grabby-accent, #2563eb); color: #fff; }
  .grabby-btn-primary:hover { background: var(--grabby-accent-hover, #1d4ed8); }
  .grabby-btn-link { border: none; padding: 4px 6px; color: var(--grabby-text-muted, #94a3b8); font-weight: 500; }
  .grabby-btn-link:hover { color: var(--grabby-accent, #2563eb); background: transparent; }
  .grabby-panel-list { overflow-y: auto; flex: 1; }
  .grabby-panel-empty { padding: 28px 18px; text-align: center; color: var(--grabby-text-muted, #94a3b8); }
  .grabby-panel-empty strong { display: block; color: var(--grabby-popover-text, #334155); margin-bottom: 4px; }
  .grabby-comment-row {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid var(--grabby-popover-border, #e2e8f0);
    cursor: pointer; position: relative;
  }
  .grabby-comment-row:last-child { border-bottom: none; }
  .grabby-comment-row:hover, .grabby-comment-row:focus-visible { background: var(--grabby-popover-hover, #f1f5f9); outline: none; }
  .grabby-comment-row.grabby-comment-missing { opacity: .6; }
  .grabby-thumb {
    flex-shrink: 0; width: 56px; height: 40px; border-radius: 6px; object-fit: cover; object-position: top left;
    background: var(--grabby-surface, #f1f5f9); border: 1px solid var(--grabby-popover-border, #e2e8f0);
  }
  .grabby-comment-body { flex: 1; min-width: 0; }
  .grabby-comment-text {
    font-weight: 500; color: var(--grabby-popover-text, #334155);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;
  }
  .grabby-comment-meta {
    margin-top: 3px; font-size: 11px; color: var(--grabby-text-muted, #94a3b8);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .grabby-comment-meta a { color: inherit; text-decoration: none; }
  .grabby-comment-meta a:hover { color: var(--grabby-accent, #2563eb); text-decoration: underline; }
  .grabby-kind {
    display: inline-block; padding: 0 5px; border-radius: 4px; margin-right: 4px;
    background: var(--grabby-surface, #f1f5f9); color: var(--grabby-toolbar-text, #64748b); font-weight: 600;
  }
  .grabby-comment-delete {
    flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 6px; background: transparent; cursor: pointer; padding: 0;
    color: var(--grabby-text-muted, #94a3b8); opacity: 0; transition: opacity .1s ease;
  }
  .grabby-comment-row:hover .grabby-comment-delete, .grabby-comment-delete:focus-visible { opacity: 1; }
  .grabby-comment-delete:hover { background: var(--grabby-surface, #e2e8f0); color: #dc2626; }
  .grabby-panel-footer {
    display: flex; justify-content: space-between; align-items: center;
    padding: 6px 8px 6px 14px; border-top: 1px solid var(--grabby-popover-border, #e2e8f0);
    font-size: 11px; color: var(--grabby-text-muted, #94a3b8);
  }
`;

export function createCommentsPanel(callbacks: CommentsPanelCallbacks): CommentsPanel {
  let panel: HTMLDivElement | null = null;
  let visible = false;
  let objectUrls: string[] = [];

  function ensurePanel(): HTMLDivElement {
    if (panel?.isConnected) return panel;
    addStyles(STYLE_ID, CSS);
    panel = h('div', { id: PANEL_ID, role: 'dialog', 'aria-label': 'Comments' });
    getUiRoot().appendChild(panel);
    return panel;
  }

  function revokeThumbs(): void {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    objectUrls = [];
  }

  function thumbnail(comment: GrabbyComment): HTMLImageElement | null {
    const localId = comment.screenshot?.localId;
    if (!localId) return null;
    const img = h('img', { class: 'grabby-thumb', alt: '', loading: 'lazy' });
    getScreenshot(localId).then((blob) => {
      if (!blob || typeof URL.createObjectURL !== 'function') { img.remove(); return; }
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      img.src = url;
    }).catch(() => img.remove());
    return img;
  }

  function row(comment: GrabbyComment, showAuthors: boolean): HTMLElement {
    const t = comment.target;
    const meta: Node[] = [h('span', { class: 'grabby-kind' }, t.kind)];
    if (t.component) meta.push(document.createTextNode(`${t.component} `));
    if (t.source) {
      meta.push(h('a', {
        href: vsCodeUri(t.source.file, t.source.line, t.source.column),
        title: `Open ${t.source.file} in VS Code`,
        onclick: (e: Event) => e.stopPropagation(),
      }, `${basename(t.source.file)}${t.source.line != null ? `:${t.source.line}` : ''}`));
    } else if (!t.component) {
      meta.push(document.createTextNode(`<${t.tag}>`));
    }
    const tail = [showAuthors ? authorLabel(comment.author) : '', formatRelativeTime(comment.createdAt)].filter(Boolean);
    meta.push(document.createTextNode(` · ${tail.join(' · ')}`));

    const del = h('button', {
      type: 'button',
      class: 'grabby-comment-delete',
      'aria-label': 'Delete comment',
      title: 'Delete comment',
      onclick: (e: Event) => { e.stopPropagation(); callbacks.onDelete(comment); },
    }, svgIcon(ICON_DISMISS));

    const el = h('div', {
      class: 'grabby-comment-row',
      role: 'button',
      tabindex: '0',
      'aria-label': `Edit comment: ${comment.comment}`,
      dataset: { grabbyCommentId: comment.id },
    },
      thumbnail(comment),
      h('div', { class: 'grabby-comment-body' },
        h('div', { class: 'grabby-comment-text' }, comment.comment),
        h('div', { class: 'grabby-comment-meta' }, ...meta),
      ),
      del,
    );
    if (!safeQuery(t.selector)) el.classList.add('grabby-comment-missing');
    el.addEventListener('mouseenter', () => callbacks.onHover(comment));
    el.addEventListener('mouseleave', () => callbacks.onHover(null));
    el.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onEdit(comment, el); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callbacks.onEdit(comment, el); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); callbacks.onDelete(comment); }
    });
    return el;
  }

  function render(comments: GrabbyComment[]): void {
    const el = ensurePanel();
    revokeThumbs();
    const n = comments.length;
    const sessions = new Set(comments.map((c) => (c.author.anonymous ? c.author.sessionId : c.author.name)));
    const showAuthors = sessions.size > 1 || comments.some((c) => !c.author.anonymous);

    const header = h('div', { class: 'grabby-panel-header' },
      h('span', { class: 'grabby-panel-title' }, 'Comments', h('span', { class: 'grabby-panel-count' }, String(n))),
      n > 0 ? h('button', {
        type: 'button',
        class: 'grabby-btn grabby-btn-primary',
        'data-grabby-copy-all': '',
        onclick: (e: Event) => { e.stopPropagation(); callbacks.onCopyAll(); },
      }, 'Copy all…') : null,
    );

    const list = n === 0
      ? h('div', { class: 'grabby-panel-empty' },
        h('strong', null, 'No comments yet'),
        'Click the hand icon (or press Alt+G), then click anything on the page to comment on it.')
      : h('div', { class: 'grabby-panel-list' }, ...comments.map((c) => row(c, showAuthors)));

    const footer = n > 0
      ? h('div', { class: 'grabby-panel-footer' },
        h('span', null, 'Click a comment to edit it'),
        h('button', {
          type: 'button',
          class: 'grabby-btn grabby-btn-link',
          'data-grabby-clear-all': '',
          onclick: (e: Event) => { e.stopPropagation(); callbacks.onClearAll(); },
        }, 'Clear all'))
      : null;

    el.replaceChildren(header, list, ...(footer ? [footer] : []));
  }

  return {
    show(comments) {
      render(comments);
      visible = true;
      void ensurePanel().offsetHeight;
      ensurePanel().classList.add('grabby-popover-visible');
    },
    refresh(comments) {
      if (visible) render(comments);
    },
    hide() {
      visible = false;
      panel?.classList.remove('grabby-popover-visible');
    },
    isVisible() {
      return visible;
    },
    isPanelElement(el) {
      return !!panel && (el === panel || panel.contains(el));
    },
    dispose() {
      revokeThumbs();
      panel?.remove();
      removeStyles(STYLE_ID);
      panel = null;
      visible = false;
    },
  };
}
