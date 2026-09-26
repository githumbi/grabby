import type { HistoryEntry } from '../types';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';
import { safeQuery } from '../utils';
import { h } from '../ui/dom';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const POPOVER_ID = '__grabby-history-popover__';
const STYLE_ID = '__grabby-history-styles__';

export interface HistoryPopover {
  show(entries: HistoryEntry[]): void;
  hide(): void;
  isVisible(): boolean;
  isPopoverElement(el: Element): boolean;
  dispose(): void;
}

export interface HistoryPopoverCallbacks {
  onEntryClick: (entry: HistoryEntry, rowEl: HTMLElement) => void;
  onEntryHover: (entry: HistoryEntry | null) => void;
  onClearAll: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortPath(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1];
}

function buildVsCodeUri(filePath: string, line: number | null, column: number | null): string {
  let uri = `vscode://file/${encodeURI(filePath)}`;
  if (line != null) uri += `:${line}`;
  if (line != null && column != null) uri += `:${column}`;
  return uri;
}

export function createHistoryPopover(callbacks: HistoryPopoverCallbacks): HistoryPopover {
  let popover: HTMLDivElement | null = null;
  let visible = false;

  function injectStyles(): void {
    if (hasStyles(STYLE_ID)) return;

    addStyles(STYLE_ID, `
      #${POPOVER_ID} {
        position: fixed;
        bottom: ${TOOLBAR_POPOVER_OFFSET};
        left: 50%;
        transform: translateX(-50%);
        z-index: ${Z_INDEX_POPOVER};
        background: var(--grabby-popover-bg, #ffffff);
        border: 1px solid var(--grabby-popover-border, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 8px 24px var(--grabby-popover-shadow, rgba(0, 0, 0, 0.12));
        min-width: 320px;
        max-width: 420px;
        max-height: 360px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.15s ease, visibility 0.15s ease;
        pointer-events: auto;
      }
      #${POPOVER_ID}.grabby-popover-visible {
        opacity: 1;
        visibility: visible;
      }
      #${POPOVER_ID} .grabby-history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 8px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--grabby-text-muted, #64748b);
        border-bottom: 1px solid var(--grabby-popover-border, #e2e8f0);
      }
      #${POPOVER_ID} .grabby-history-copy-all {
        font-size: 11px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        color: var(--grabby-accent, #2563eb);
        background: transparent;
        border: 1px solid var(--grabby-accent, #2563eb);
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        line-height: 1.5;
        transition: background 0.1s ease, color 0.1s ease;
        font-family: inherit;
      }
      #${POPOVER_ID} .grabby-history-copy-all:hover {
        background: var(--grabby-accent, #2563eb);
        color: #fff;
      }
      #${POPOVER_ID} .grabby-history-empty {
        padding: 24px 14px;
        text-align: center;
        color: var(--grabby-text-muted, #64748b);
        font-size: 13px;
      }
      #${POPOVER_ID} .grabby-history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 14px;
        cursor: pointer;
        border: none;
        border-bottom: 1px solid var(--grabby-popover-border, #e2e8f0);
        background: transparent;
        width: 100%;
        text-align: left;
        font: inherit;
        color: inherit;
        transition: background 0.1s ease;
      }
      #${POPOVER_ID} .grabby-history-item:last-child {
        border-bottom: none;
      }
      #${POPOVER_ID} .grabby-history-item:hover {
        background: var(--grabby-popover-hover, #f1f5f9);
      }
      #${POPOVER_ID} .grabby-history-info {
        flex: 1;
        min-width: 0;
      }
      #${POPOVER_ID} .grabby-history-comment-title {
        font-size: 13px;
        font-weight: 500;
        color: var(--grabby-accent, #2563eb);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${POPOVER_ID} .grabby-history-selector {
        font: 11px/1.3 ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
        color: var(--grabby-text-muted, #64748b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 2px;
      }
      #${POPOVER_ID} .grabby-history-meta {
        font-size: 11px;
        color: var(--grabby-text-muted, #64748b);
        margin-top: 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${POPOVER_ID} .grabby-history-time {
        font-size: 11px;
        color: var(--grabby-text-muted, #64748b);
        flex-shrink: 0;
      }
      #${POPOVER_ID} .grabby-history-file-link {
        color: var(--grabby-text-muted, #64748b);
        text-decoration: none;
      }
      #${POPOVER_ID} .grabby-history-file-link:hover {
        text-decoration: underline;
        color: var(--grabby-accent, #2563eb);
      }
      #${POPOVER_ID} .grabby-history-actions {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      #${POPOVER_ID} .grabby-history-clear-all {
        font-size: 11px;
        font-weight: 500;
        text-transform: none;
        letter-spacing: 0;
        color: var(--grabby-text-muted, #94a3b8);
        background: transparent;
        border: 1px solid var(--grabby-popover-border, #e2e8f0);
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        line-height: 1.5;
        transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
        font-family: inherit;
      }
      #${POPOVER_ID} .grabby-history-clear-all:hover {
        color: var(--grabby-accent, #2563eb);
        border-color: var(--grabby-accent, #2563eb);
      }
      #${POPOVER_ID} .grabby-history-item-missing {
        opacity: 0.6;
      }
    `);
  }

  function ensurePopover(): HTMLDivElement {
    if (popover) return popover;

    injectStyles();
    popover = document.createElement('div');
    popover.id = POPOVER_ID;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Grab history');
    getUiRoot().appendChild(popover);
    return popover;
  }

  function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
    return h('button', {
      type: 'button',
      class: className,
      onclick: (e: Event) => { e.stopPropagation(); onClick(); },
    }, label);
  }

  function renderItem(entry: HistoryEntry): HTMLButtonElement {
    const { context } = entry;
    const meta: Node[] = [];
    if (context.componentName) meta.push(document.createTextNode(`in ${context.componentName}`));
    if (context.filePath) {
      if (meta.length) meta.push(document.createTextNode(' \u2014 '));
      meta.push(h('a', {
        class: 'grabby-history-file-link',
        href: buildVsCodeUri(context.filePath, context.line, context.column),
        title: 'Open in VS Code',
      }, shortPath(context.filePath)));
    }

    const item = h('button', {
      type: 'button',
      class: 'grabby-history-item',
      'aria-label': `Edit comment for ${entry.comment || context.selector}`,
      dataset: { grabbyHistoryId: entry.id },
    },
      h('div', { class: 'grabby-history-info' },
        entry.comment ? h('div', { class: 'grabby-history-comment-title' }, entry.comment) : null,
        h('div', { class: 'grabby-history-selector' }, context.selector),
        meta.length ? h('div', { class: 'grabby-history-meta' }, ...meta) : null,
      ),
      h('span', { class: 'grabby-history-time' }, formatRelativeTime(entry.timestamp)),
    );

    if (!safeQuery(context.selector)) item.classList.add('grabby-history-item-missing');
    item.addEventListener('mouseenter', () => callbacks.onEntryHover(entry));
    item.addEventListener('mouseleave', () => callbacks.onEntryHover(null));
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onEntryClick(entry, item);
    });
    return item;
  }

  function render(entries: HistoryEntry[]): void {
    const el = ensurePopover();

    const header = h('div', { class: 'grabby-history-header' }, h('span', null, 'History'));
    if (entries.length > 0) {
      const copyAll = button('grabby-history-copy-all', 'Copy all', () => {
        navigator.clipboard.writeText(formatAllEntries(entries)).then(() => {
          copyAll.textContent = 'Copied!';
          setTimeout(() => { copyAll.textContent = 'Copy all'; }, 1500);
        }).catch(() => {
          copyAll.textContent = 'Copy blocked';
          setTimeout(() => { copyAll.textContent = 'Copy all'; }, 1500);
        });
      });
      copyAll.setAttribute('data-grabby-copy-all', '');
      const clearAll = button('grabby-history-clear-all', 'Clear all', () => callbacks.onClearAll());
      clearAll.setAttribute('data-grabby-clear-all', '');
      header.appendChild(h('span', { class: 'grabby-history-actions' }, clearAll, copyAll));
    }

    const body = entries.length === 0
      ? [h('div', { class: 'grabby-history-empty' }, 'No elements grabbed yet')]
      : entries.map(renderItem);

    el.replaceChildren(header, ...body);
  }

  function formatAllEntries(entries: HistoryEntry[]): string {
    if (entries.length === 1) {
      const e = entries[0];
      return e.comment ? `${e.comment}\n\n${e.snippet}` : e.snippet;
    }
    return entries.map((e, i) => {
      const label = e.comment ? `[${i + 1}] ${e.comment}` : `[${i + 1}]`;
      return `${label}\n\n${e.snippet}`;
    }).join('\n\n---\n\n');
  }

  return {
    show(entries: HistoryEntry[]): void {
      render(entries);
      visible = true;
      // Force reflow for transition
      void ensurePopover().offsetHeight;
      ensurePopover().classList.add('grabby-popover-visible');
    },

    hide(): void {
      visible = false;
      popover?.classList.remove('grabby-popover-visible');
    },

    isVisible(): boolean {
      return visible;
    },

    isPopoverElement(el: Element): boolean {
      if (!popover) return false;
      let current: Element | null = el;
      while (current) {
        if (current === popover || current.id === POPOVER_ID) return true;
        current = current.parentElement;
      }
      return false;
    },

    dispose(): void {
      popover?.remove();
      removeStyles(STYLE_ID);
      popover = null;
      visible = false;
    },
  };
}
