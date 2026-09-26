import { addStyles, removeStyles, getUiRoot } from '../ui/root';
import { h } from '../ui/dom';
import { Z_INDEX_POPOVER, TOOLBAR_POPOVER_OFFSET } from '../constants';

const ID = '__grabby-coach__';
const STYLE_ID = 'coach-mark';
const SEEN_KEY = 'grabby:v1:onboarded';

const CSS = `
  #${ID} {
    position: fixed; bottom: ${TOOLBAR_POPOVER_OFFSET}; left: 50%; transform: translateX(-50%);
    z-index: ${Z_INDEX_POPOVER}; width: min(320px, calc(100vw - 32px)); box-sizing: border-box;
    padding: 14px 16px; border-radius: 12px; background: #0f172a; color: #f8fafc;
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 12px 32px rgba(15, 23, 42, .3); animation: grabby-coach-in .2s ease;
  }
  #${ID}::after {
    content: ''; position: absolute; bottom: -6px; left: 50%; margin-left: -6px;
    border: 6px solid transparent; border-bottom: 0; border-top-color: #0f172a;
  }
  @keyframes grabby-coach-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
  #${ID} strong { display: block; font-size: 14px; margin-bottom: 6px; }
  #${ID} ol { margin: 0 0 10px; padding-left: 20px; }
  #${ID} li { margin: 2px 0; }
  #${ID} button {
    font: 600 12px/1 inherit; font-family: inherit; padding: 7px 12px; border-radius: 7px; border: 0;
    background: #f8fafc; color: #0f172a; cursor: pointer; float: right;
  }
  #${ID} .grabby-coach-foot { overflow: hidden; color: #94a3b8; font-size: 12px; line-height: 28px; }
`;

function seen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

function markSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

export interface CoachMark {
  /** Shows the tips once per browser. */
  maybeShow(): void;
  dismiss(): void;
  dispose(): void;
}

/**
 * Three steps above the toolbar the first time someone opens a feedback
 * link. Reviewers are often not technical and have never seen the tool.
 */
export function createCoachMark(): CoachMark {
  let el: HTMLDivElement | null = null;

  function dismiss(): void {
    markSeen();
    el?.remove();
    el = null;
  }

  return {
    maybeShow() {
      if (el || seen()) return;
      addStyles(STYLE_ID, CSS);
      el = h('div', { id: ID, role: 'dialog', 'aria-label': 'How to leave feedback' },
        h('strong', null, 'Leave feedback on this page'),
        h('ol', null,
          h('li', null, 'Click ', h('b', null, 'Comment'), ' below.'),
          h('li', null, 'Click the part of the page you want to talk about.'),
          h('li', null, 'Type your note and press Enter.'),
        ),
        h('div', { class: 'grabby-coach-foot' },
          'A screenshot is attached for you.',
          h('button', { type: 'button', onclick: (e: Event) => { e.stopPropagation(); dismiss(); } }, 'Got it'),
        ),
      );
      getUiRoot().appendChild(el);
    },
    dismiss,
    dispose() {
      el?.remove();
      el = null;
      removeStyles(STYLE_ID);
    },
  };
}
