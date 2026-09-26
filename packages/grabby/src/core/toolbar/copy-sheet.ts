import type { DetailLevel } from '../types';
import { addStyles, removeStyles, getUiRoot } from '../ui/root';
import { h } from '../ui/dom';
import { estimateTokens } from '../capture/export';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const SHEET_ID = '__grabby-copy-sheet__';
const STYLE_ID = 'copy-sheet';

export type CopyMode = 'clear' | 'keep';

export interface CopySheetOpenOptions {
  count: number;
  level: DetailLevel;
  /** Builds the export text for a detail level. */
  render: (level: DetailLevel) => string;
}

export interface CopySheetCallbacks {
  /** Copies `text`; resolve false if the clipboard refused. */
  onCopy: (text: string, mode: CopyMode, level: DetailLevel) => Promise<boolean>;
  onLevelChange?: (level: DetailLevel) => void;
  onClose?: () => void;
}

export interface CopySheet {
  open(options: CopySheetOpenOptions): void;
  close(): void;
  isVisible(): boolean;
  isSheetElement(el: Element): boolean;
  dispose(): void;
}

const LEVELS: Array<{ id: DetailLevel; label: string; hint: string }> = [
  { id: 'compact', label: 'Compact', hint: 'One line per comment: file, component and your note.' },
  { id: 'standard', label: 'Standard', hint: 'Adds the element, its key facts and styles. Best for most fixes.' },
  { id: 'detailed', label: 'Detailed', hint: 'Adds ancestors, position and all custom styles, for tricky layout bugs.' },
];

const CSS = `
  #${SHEET_ID} {
    position: fixed;
    bottom: ${TOOLBAR_POPOVER_OFFSET};
    left: 50%;
    transform: translateX(-50%);
    z-index: ${Z_INDEX_POPOVER};
    width: min(560px, calc(100vw - 32px));
    display: flex; flex-direction: column; gap: 10px;
    padding: 14px;
    background: var(--grabby-popover-bg, #fff);
    color: var(--grabby-popover-text, #334155);
    border: 1px solid var(--grabby-popover-border, #e2e8f0);
    border-radius: 14px;
    box-shadow: 0 12px 32px var(--grabby-popover-shadow, rgba(0,0,0,.16));
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: grabby-sheet-in .14s ease;
  }
  @keyframes grabby-sheet-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .grabby-sheet-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .grabby-sheet-title { font-weight: 600; font-size: 14px; }
  .grabby-sheet-tokens { font-size: 12px; color: var(--grabby-text-muted, #94a3b8); white-space: nowrap; }
  .grabby-seg { display: flex; padding: 3px; gap: 2px; border-radius: 9px; background: var(--grabby-surface, #f1f5f9); }
  .grabby-seg button {
    flex: 1; font: 600 12px/1 inherit; font-family: inherit; padding: 7px 8px; border: none; border-radius: 7px;
    background: transparent; color: var(--grabby-toolbar-text, #64748b); cursor: pointer;
  }
  .grabby-seg button[aria-checked="true"] { background: var(--grabby-popover-bg, #fff); color: var(--grabby-popover-text, #334155); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
  .grabby-sheet-hint { font-size: 12px; color: var(--grabby-text-muted, #94a3b8); margin-top: -4px; }
  .grabby-sheet textarea {
    width: 100%; box-sizing: border-box; height: 220px; resize: vertical;
    padding: 10px; border-radius: 8px; border: 1px solid var(--grabby-popover-border, #e2e8f0);
    background: var(--grabby-surface, #f8fafc); color: var(--grabby-popover-text, #334155);
    font: 12px/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; outline: none;
  }
  .grabby-sheet textarea:focus { border-color: var(--grabby-accent, #2563eb); }
  .grabby-sheet-status { font-size: 12px; min-height: 16px; color: var(--grabby-text-muted, #94a3b8); }
  .grabby-sheet-status.grabby-error { color: #b91c1c; }
  .grabby-sheet-actions { display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
  .grabby-sheet-actions .grabby-spacer { flex: 1; font-size: 11px; color: var(--grabby-text-muted, #94a3b8); }
  .grabby-sheet .grabby-btn {
    font: 600 13px/1 inherit; font-family: inherit; padding: 9px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--grabby-popover-border, #e2e8f0); background: transparent; color: var(--grabby-popover-text, #334155);
  }
  .grabby-sheet .grabby-btn:hover { background: var(--grabby-popover-hover, #f1f5f9); }
  .grabby-sheet .grabby-btn-primary { background: var(--grabby-accent, #2563eb); border-color: var(--grabby-accent, #2563eb); color: #fff; }
  .grabby-sheet .grabby-btn-primary:hover { background: var(--grabby-accent-hover, #1d4ed8); }
`;

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

export function createCopySheet(callbacks: CopySheetCallbacks): CopySheet {
  let sheet: HTMLDivElement | null = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;

  function close(): void {
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
    callbacks.onClose?.();
  }

  function open(options: CopySheetOpenOptions): void {
    close();
    addStyles(STYLE_ID, CSS);
    let level = options.level;
    let edited = false;
    const mod = isMacPlatform() ? '⌘' : 'Ctrl';

    const tokens = h('span', { class: 'grabby-sheet-tokens' });
    const hint = h('div', { class: 'grabby-sheet-hint' });
    const status = h('div', { class: 'grabby-sheet-status', role: 'status', 'aria-live': 'polite' });
    const textarea = h('textarea', { 'aria-label': 'Text that will be copied', spellcheck: 'false' });
    const segButtons = new Map<DetailLevel, HTMLButtonElement>();

    function updateTokens(): void {
      tokens.textContent = `≈ ${estimateTokens(textarea.value).toLocaleString()} tokens`;
    }

    function setLevel(next: DetailLevel, force = false): void {
      if (next === level && !force) return;
      // Switching levels regenerates the text; say so rather than dropping edits silently.
      const discarded = edited && next !== level;
      level = next;
      edited = false;
      textarea.value = options.render(level);
      hint.textContent = LEVELS.find((l) => l.id === level)?.hint ?? '';
      for (const [id, btn] of segButtons) btn.setAttribute('aria-checked', String(id === level));
      status.classList.remove('grabby-error');
      status.textContent = discarded ? 'Your edits were replaced by the new detail level.' : '';
      updateTokens();
      callbacks.onLevelChange?.(level);
    }

    const seg = h('div', { class: 'grabby-seg', role: 'radiogroup', 'aria-label': 'Detail level' },
      ...LEVELS.map((l) => {
        const btn = h('button', {
          type: 'button',
          role: 'radio',
          'aria-checked': 'false',
          title: l.hint,
          onclick: (e: Event) => { e.stopPropagation(); setLevel(l.id); },
        }, l.label);
        segButtons.set(l.id, btn);
        return btn;
      }),
    );

    async function copy(mode: CopyMode): Promise<void> {
      const ok = await callbacks.onCopy(textarea.value, mode, level);
      if (ok) {
        close();
        return;
      }
      // The clipboard refused (usually because the page lost focus). Leave the
      // text selected so a manual copy works, and don't clear anything.
      textarea.focus();
      textarea.select();
      status.classList.add('grabby-error');
      status.textContent = `The browser blocked the clipboard. The text is selected; press ${mod}+C to copy it.`;
    }

    textarea.addEventListener('input', () => { edited = true; updateTokens(); });

    const count = options.count;
    sheet = h('div', { id: SHEET_ID, class: 'grabby-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Copy comments' },
      h('div', { class: 'grabby-sheet-head' },
        h('span', { class: 'grabby-sheet-title' }, `Copy ${count} comment${count === 1 ? '' : 's'} for your AI agent`),
        tokens,
      ),
      seg,
      hint,
      textarea,
      status,
      h('div', { class: 'grabby-sheet-actions' },
        h('span', { class: 'grabby-spacer' }, `${mod}+Enter copies and clears · Esc closes`),
        h('button', { type: 'button', class: 'grabby-btn', 'data-grabby-copy-keep': '', onclick: (e: Event) => { e.stopPropagation(); void copy('keep'); } }, 'Copy, keep comments'),
        h('button', { type: 'button', class: 'grabby-btn grabby-btn-primary', 'data-grabby-copy-clear': '', onclick: (e: Event) => { e.stopPropagation(); void copy('clear'); } }, 'Copy & clear'),
      ),
    );

    keyHandler = (e: KeyboardEvent) => {
      if (!sheet) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void copy('clear');
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    getUiRoot().appendChild(sheet);
    setLevel(level, true);
    (sheet.querySelector('[data-grabby-copy-clear]') as HTMLButtonElement | null)?.focus();
  }

  return {
    open,
    close,
    isVisible: () => !!sheet,
    isSheetElement: (el) => !!sheet && (el === sheet || sheet.contains(el)),
    dispose() {
      close();
      removeStyles(STYLE_ID);
    },
  };
}
