import { addStyles, removeStyles, getUiRoot } from '../ui/root';
import { h } from '../ui/dom';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const SHEET_ID = '__grabby-finish-sheet__';
const STYLE_ID = 'finish-sheet';
/** How long Done waits for the last comments before saying they'll go later. */
const WAIT_MS = 15_000;
/** While waiting, retry this often instead of following the outbox backoff. */
const RETRY_EVERY_MS = 3_000;

export interface ReviewCounts {
  total: number;
  sent: number;
  pending: number;
  failed: number;
}

export interface FinishSheetCallbacks {
  /** The reviewer is done with this round. */
  onDone: () => void;
  /** Send whatever is queued now. */
  onRetry: () => void;
}

export interface FinishSheet {
  open(counts: ReviewCounts): void;
  update(counts: ReviewCounts): void;
  close(): void;
  isVisible(): boolean;
  isSheetElement(el: Element): boolean;
  dispose(): void;
}

const CSS = `
  #${SHEET_ID} {
    position: fixed;
    bottom: ${TOOLBAR_POPOVER_OFFSET};
    left: 50%;
    transform: translateX(-50%);
    z-index: ${Z_INDEX_POPOVER};
    width: min(360px, calc(100vw - 32px));
    box-sizing: border-box;
    display: flex; flex-direction: column; gap: 10px;
    padding: 16px;
    background: var(--grabby-popover-bg, #fff);
    color: var(--grabby-popover-text, #334155);
    border: 1px solid var(--grabby-popover-border, #e2e8f0);
    border-radius: 14px;
    box-shadow: 0 12px 32px var(--grabby-popover-shadow, rgba(0,0,0,.16));
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    animation: grabby-finish-in .14s ease;
  }
  @keyframes grabby-finish-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .grabby-finish-title { font-weight: 600; font-size: 15px; }
  .grabby-finish-lines { display: flex; flex-direction: column; gap: 4px; }
  .grabby-finish-line[data-tone="ok"] { color: #15803d; font-weight: 600; }
  .grabby-finish-line[data-tone="error"] { color: #b91c1c; font-weight: 600; }
  .grabby-finish-note { font-size: 12px; color: var(--grabby-text-muted, #94a3b8); }
  .grabby-finish-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .grabby-finish .grabby-btn {
    font: 600 13px/1 inherit; font-family: inherit; padding: 9px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--grabby-popover-border, #e2e8f0); background: transparent; color: var(--grabby-popover-text, #334155);
  }
  .grabby-finish .grabby-btn:hover { background: var(--grabby-popover-hover, #f1f5f9); }
  .grabby-finish .grabby-btn[disabled] { opacity: .6; cursor: default; }
  .grabby-finish .grabby-btn-primary { background: var(--grabby-accent, #2563eb); border-color: var(--grabby-accent, #2563eb); color: #fff; }
  .grabby-finish .grabby-btn-primary:hover { background: var(--grabby-accent-hover, #1d4ed8); }
`;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The end of a live review: what reached the team, what's still on its way,
 * and a clear way out. Comments are sent as they're saved, so nothing here
 * is required; it's there so reviewers know they're done.
 */
export function createFinishSheet(callbacks: FinishSheetCallbacks): FinishSheet {
  let sheet: HTMLDivElement | null = null;
  let keyHandler: ((e: KeyboardEvent) => void) | null = null;
  let counts: ReviewCounts = { total: 0, sent: 0, pending: 0, failed: 0 };
  // Done was pressed while comments were still sending.
  let waiting = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let timedOut = false;

  function stopWaiting(): void {
    waiting = false;
    if (waitTimer) clearTimeout(waitTimer);
    if (retryTimer) clearInterval(retryTimer);
    waitTimer = null;
    retryTimer = null;
  }

  function close(): void {
    stopWaiting();
    timedOut = false;
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler, true);
      keyHandler = null;
    }
  }

  function done(): void {
    close();
    callbacks.onDone();
  }

  function pressDone(): void {
    if (counts.pending === 0 || timedOut) {
      done();
      return;
    }
    waiting = true;
    callbacks.onRetry();
    retryTimer = setInterval(callbacks.onRetry, RETRY_EVERY_MS);
    waitTimer = setTimeout(() => {
      stopWaiting();
      timedOut = true;
      render();
    }, WAIT_MS);
    render();
  }

  function button(label: string, onClick: () => void, primary = false, disabled = false): HTMLButtonElement {
    const btn = h('button', {
      type: 'button',
      class: primary ? 'grabby-btn grabby-btn-primary' : 'grabby-btn',
      onclick: (e: Event) => { e.stopPropagation(); onClick(); },
    }, label);
    btn.disabled = disabled;
    return btn;
  }

  function render(): void {
    if (!sheet) return;
    const { total, sent, pending, failed } = counts;
    const lines: HTMLElement[] = [];
    let note = '';

    if (total === 0) {
      lines.push(h('div', { class: 'grabby-finish-line' }, 'You haven\'t left any comments yet.'));
    } else if (pending === 0 && failed === 0) {
      lines.push(h('div', { class: 'grabby-finish-line', 'data-tone': 'ok' },
        total === 1 ? '✓ Your comment was sent to the team.' : `✓ All ${total} comments were sent to the team.`));
      note = 'Press Done to start a fresh list, or just close this tab.';
    } else {
      if (sent) lines.push(h('div', { class: 'grabby-finish-line', 'data-tone': 'ok' }, `✓ ${plural(sent, 'comment')} sent to the team`));
      if (pending) lines.push(h('div', { class: 'grabby-finish-line' }, `${plural(pending, 'comment')} still sending…`));
      if (failed) lines.push(h('div', { class: 'grabby-finish-line', 'data-tone': 'error' }, `${plural(failed, 'comment')} couldn't be sent`));
      if (timedOut && pending) note = 'They\'re saved in this browser and will be sent the next time you open this site. You can close this tab.';
      else if (pending) note = 'Keep this tab open for a moment.';
      else if (failed) note = 'Try again, or let the team know your feedback didn\'t go through.';
    }

    const actions: HTMLButtonElement[] = [button('Keep reviewing', close)];
    if (failed) actions.push(button('Try again', callbacks.onRetry));
    if (total === 0) actions.push(button('Exit feedback mode', done, true));
    else if (waiting) actions.push(button('Sending…', () => {}, true, true));
    else actions.push(button('Done', pressDone, true));

    sheet.replaceChildren(
      h('div', { class: 'grabby-finish-title' }, 'Your review'),
      h('div', { class: 'grabby-finish-lines', role: 'status', 'aria-live': 'polite' }, ...lines),
      ...(note ? [h('div', { class: 'grabby-finish-note' }, note)] : []),
      h('div', { class: 'grabby-finish-actions' }, ...actions),
    );
    (sheet.querySelector('.grabby-btn-primary:not([disabled])') as HTMLButtonElement | null)?.focus();
  }

  return {
    open(next) {
      close();
      addStyles(STYLE_ID, CSS);
      counts = next;
      sheet = h('div', { id: SHEET_ID, class: 'grabby-finish', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Finish review' });
      keyHandler = (e: KeyboardEvent) => {
        if (sheet && e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
        }
      };
      document.addEventListener('keydown', keyHandler, true);
      getUiRoot().appendChild(sheet);
      render();
    },
    update(next) {
      if (!sheet) return;
      counts = next;
      if (waiting && next.pending === 0) {
        stopWaiting();
        if (next.failed === 0) {
          done();
          return;
        }
      }
      render();
    },
    close,
    isVisible: () => !!sheet,
    isSheetElement: (el) => !!sheet && (el === sheet || sheet.contains(el)),
    dispose() {
      close();
      removeStyles(STYLE_ID);
    },
  };
}
