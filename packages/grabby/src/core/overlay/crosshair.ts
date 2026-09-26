import { Z_INDEX_CROSSHAIR } from '../constants';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';

const CROSSHAIR_STYLE_ID = '__grabby-crosshair-styles__';
const CURSOR_STYLE_ID = '__grabby-crosshair-cursor__';
const H_LINE_ID = '__grabby-crosshair-h__';
const V_LINE_ID = '__grabby-crosshair-v__';

export interface Crosshair {
  activate(): void;
  deactivate(): void;
  isCrosshairElement(el: Element): boolean;
  dispose(): void;
}

export function createCrosshair(): Crosshair {
  let hLine: HTMLDivElement | null = null;
  let vLine: HTMLDivElement | null = null;
  let listening = false;

  function injectStyles(): void {
    if (hasStyles(CROSSHAIR_STYLE_ID)) return;

    addStyles(CROSSHAIR_STYLE_ID, `
      .grabby-crosshair-line {
        position: fixed;
        pointer-events: none;
        z-index: ${Z_INDEX_CROSSHAIR};
        background: var(--grabby-accent, #2563eb);
        opacity: 0.25;
        transition: none;
      }
      #${H_LINE_ID} {
        left: 0;
        right: 0;
        height: 1px;
      }
      #${V_LINE_ID} {
        top: 0;
        bottom: 0;
        width: 1px;
      }
    `);
    // The cursor rule targets the page itself, so it can't live in the shadow root.
    addStyles(CURSOR_STYLE_ID, 'body.grabby-crosshair-active { cursor: crosshair !important; }', 'document');
  }

  function ensureElements(): void {
    if (!hLine) {
      injectStyles();
      hLine = document.createElement('div');
      hLine.id = H_LINE_ID;
      hLine.className = 'grabby-crosshair-line';
      getUiRoot().appendChild(hLine);
    }
    if (!vLine) {
      vLine = document.createElement('div');
      vLine.id = V_LINE_ID;
      vLine.className = 'grabby-crosshair-line';
      getUiRoot().appendChild(vLine);
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    if (hLine) {
      hLine.style.top = `${e.clientY}px`;
    }
    if (vLine) {
      vLine.style.left = `${e.clientX}px`;
    }
  }

  return {
    activate(): void {
      if (listening) return;
      listening = true;
      ensureElements();
      document.body.classList.add('grabby-crosshair-active');
      document.addEventListener('mousemove', handleMouseMove, true);
    },

    deactivate(): void {
      if (!listening) return;
      listening = false;
      document.body.classList.remove('grabby-crosshair-active');
      document.removeEventListener('mousemove', handleMouseMove, true);
      if (hLine) hLine.style.top = '-10px';
      if (vLine) vLine.style.left = '-10px';
    },

    isCrosshairElement(el: Element): boolean {
      return el === hLine || el === vLine
        || el.id === H_LINE_ID || el.id === V_LINE_ID;
    },

    dispose(): void {
      this.deactivate();
      hLine?.remove();
      vLine?.remove();
      removeStyles(CROSSHAIR_STYLE_ID);
      removeStyles(CURSOR_STYLE_ID);
      hLine = null;
      vLine = null;
    },
  };
}
