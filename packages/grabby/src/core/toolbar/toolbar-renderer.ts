import type { GrabState } from '../store';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';
import { Z_INDEX_TOOLBAR } from '../constants';
import { ICON_GRAB, ICON_HISTORY, ICON_POWER, ICON_DISMISS } from './toolbar-icons';
import { svgIcon, type IconSpec } from '../ui/dom';

const TOOLBAR_ID = '__grabby-toolbar__';
const STYLE_ID = '__grabby-toolbar-styles__';

export interface ToolbarCallbacks {
  onSelectionMode: () => void;
  onHistory: () => void;
  onEnableToggle: () => void;
  onDismiss: () => void;
}

export interface ToolbarRenderer {
  show(): void;
  hide(): void;
  update(state: GrabState): void;
  isToolbarElement(el: Element): boolean;
  dispose(): void;
}

export function createToolbarRenderer(callbacks: ToolbarCallbacks): ToolbarRenderer {
  let container: HTMLDivElement | null = null;
  let leftGroup: HTMLDivElement | null = null;
  let buttons: Record<string, HTMLButtonElement> = {};
  let allElements = new Set<Element>();
  let badge: HTMLSpanElement | null = null;

  function injectStyles(): void {
    if (hasStyles(STYLE_ID)) return;

    addStyles(STYLE_ID, `
      #${TOOLBAR_ID} {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: ${Z_INDEX_TOOLBAR};
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        background: var(--grabby-toolbar-bg, #ffffff);
        border: 1px solid var(--grabby-toolbar-border, #e2e8f0);
        border-radius: 24px;
        box-shadow: 0 4px 16px var(--grabby-toolbar-shadow, rgba(0, 0, 0, 0.12));
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #${TOOLBAR_ID}.grabby-toolbar-hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
      }
      #${TOOLBAR_ID} button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--grabby-toolbar-text, #64748b);
        cursor: pointer;
        padding: 0;
        transition: background 0.15s ease, color 0.15s ease;
      }
      #${TOOLBAR_ID} button:hover {
        background: var(--grabby-toolbar-hover, #f1f5f9);
        color: var(--grabby-accent, #2563eb);
      }
      #${TOOLBAR_ID} button { position: relative; }
      #${TOOLBAR_ID} .grabby-badge {
        position: absolute;
        top: 1px;
        right: 1px;
        min-width: 15px;
        height: 15px;
        padding: 0 4px;
        box-sizing: border-box;
        border-radius: 8px;
        background: var(--grabby-accent, #2563eb);
        color: #fff;
        font: 700 9px/15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        text-align: center;
        pointer-events: none;
      }
      #${TOOLBAR_ID} .grabby-badge[hidden] { display: none; }
      #${TOOLBAR_ID} button.grabby-btn-active {
        color: var(--grabby-toolbar-active, #2563eb);
      }
      #${TOOLBAR_ID} button.grabby-btn-disabled {
        opacity: 0.4;
        color: var(--grabby-toolbar-text, #64748b);
      }
      #${TOOLBAR_ID} .grabby-toolbar-divider {
        width: 1px;
        height: 20px;
        background: var(--grabby-toolbar-border, #e2e8f0);
        margin: 0 4px;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .grabby-toolbar-left {
        display: flex;
        align-items: center;
        gap: 2px;
        overflow: hidden;
        max-width: 240px;
        opacity: 1;
        transition: max-width 0.25s ease, opacity 0.2s ease, margin 0.25s ease;
      }
      #${TOOLBAR_ID} .grabby-toolbar-left.grabby-toolbar-left-hidden {
        max-width: 0;
        opacity: 0;
        pointer-events: none;
      }
    `);
  }

  function createButton(name: string, icon: IconSpec, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.appendChild(svgIcon(icon));
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('data-grabby-btn', name);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function ensureContainer(): void {
    if (container) return;

    injectStyles();

    container = document.createElement('div');
    container.id = TOOLBAR_ID;
    container.setAttribute('role', 'toolbar');
    container.setAttribute('aria-label', 'Grabby toolbar');

    buttons.selection = createButton('selection', ICON_GRAB, 'Comment on an element (Alt+G)', callbacks.onSelectionMode);
    buttons.history = createButton('history', ICON_HISTORY, 'Comments', callbacks.onHistory);
    badge = document.createElement('span');
    badge.className = 'grabby-badge';
    badge.hidden = true;
    buttons.history.appendChild(badge);
    buttons.enable = createButton('enable', ICON_POWER, 'Enable/Disable', callbacks.onEnableToggle);
    buttons.dismiss = createButton('dismiss', ICON_DISMISS, 'Dismiss toolbar', callbacks.onDismiss);

    const divider = document.createElement('span');
    divider.className = 'grabby-toolbar-divider';

    leftGroup = document.createElement('div');
    leftGroup.className = 'grabby-toolbar-left';
    leftGroup.appendChild(buttons.selection);
    leftGroup.appendChild(buttons.history);
    leftGroup.appendChild(divider);

    container.appendChild(leftGroup);
    container.appendChild(buttons.enable);
    container.appendChild(buttons.dismiss);

    getUiRoot().appendChild(container);

    // Track all elements for isToolbarElement checks
    allElements.clear();
    allElements.add(container);
    allElements.add(leftGroup);
    allElements.add(divider);
    for (const btn of Object.values(buttons)) {
      allElements.add(btn);
    }
  }

  return {
    show(): void {
      ensureContainer();
      container!.classList.remove('grabby-toolbar-hidden');
    },

    hide(): void {
      if (container) {
        container.classList.add('grabby-toolbar-hidden');
      }
    },

    update(state: GrabState): void {
      if (!container) return;

      if (state.active) {
        buttons.selection.classList.add('grabby-btn-active');
      } else {
        buttons.selection.classList.remove('grabby-btn-active');
      }

      const count = state.toolbar.comments.length;
      if (badge) {
        badge.hidden = count === 0;
        badge.textContent = count > 99 ? '99+' : String(count);
      }
      buttons.history.setAttribute('aria-label', count ? `Comments (${count})` : 'Comments');

      if (state.options.enabled) {
        buttons.enable.classList.add('grabby-btn-active');
        leftGroup?.classList.remove('grabby-toolbar-left-hidden');
      } else {
        buttons.enable.classList.remove('grabby-btn-active');
        leftGroup?.classList.add('grabby-toolbar-left-hidden');
      }
    },

    isToolbarElement(el: Element): boolean {
      if (allElements.has(el)) return true;

      // Walk up to check if el is inside the toolbar (e.g. SVG children)
      let current: Element | null = el;
      while (current) {
        if (current === container) return true;
        if (current.id === TOOLBAR_ID) return true;
        current = current.parentElement;
      }
      return false;
    },

    dispose(): void {
      container?.remove();
      removeStyles(STYLE_ID);
      container = null;
      leftGroup = null;
      buttons = {};
      badge = null;
      allElements.clear();
    },
  };
}
