import { Z_INDEX_OVERLAY, Z_INDEX_LABEL } from '../constants';
import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';

const OVERLAY_ID = '__grabby-overlay__';
const LABEL_ID = '__grabby-label__';
const STYLE_ID = '__grabby-styles__';
const MAX_LABEL_CLASSES = 3;

export interface OverlayRenderer {
  show(element: Element, componentName: string | null, sourcePath?: string | null, cssClasses?: string[]): void;
  hide(): void;
  isOverlayElement(el: Element): boolean;
  dispose(): void;
}

export function createOverlayRenderer(): OverlayRenderer {
  let overlay: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let rafId: number | null = null;
  let currentElement: Element | null = null;
  let currentComponentName: string | null = null;
  let currentSourcePath: string | null = null;
  let currentCssClasses: string[] = [];

  function injectStyles(): void {
    if (hasStyles(STYLE_ID)) return;

    addStyles(STYLE_ID, `
      #${OVERLAY_ID} {
        position: fixed;
        pointer-events: none;
        z-index: ${Z_INDEX_OVERLAY};
        border: 2px solid var(--grabby-overlay-border, #2563eb);
        background: var(--grabby-overlay-bg, rgba(59, 130, 246, 0.1));
        transition: top 0.05s ease, left 0.05s ease, width 0.05s ease, height 0.05s ease;
        box-sizing: border-box;
      }
      #${LABEL_ID} {
        position: fixed;
        pointer-events: none;
        z-index: ${Z_INDEX_LABEL};
        background: var(--grabby-label-bg, #2563eb);
        color: var(--grabby-label-text, #fff);
        font: 11px/1.4 monospace;
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        box-sizing: border-box;
        max-width: min(100vw, 560px);
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `);
  }

  function ensureElements(): void {
    if (!overlay) {
      injectStyles();
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      getUiRoot().appendChild(overlay);
    }
    if (!label) {
      label = document.createElement('div');
      label.id = LABEL_ID;
      getUiRoot().appendChild(label);
    }
  }

  function positionOverlay(): void {
    if (!currentElement || !overlay || !label) return;

    const rect = currentElement.getBoundingClientRect();

    // Hide overlay if element is detached or has zero dimensions
    if (rect.width === 0 && rect.height === 0 && !currentElement.isConnected) {
      overlay.style.display = 'none';
      label.style.display = 'none';
      return;
    }

    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = 'block';

    const tag = currentElement.tagName.toLowerCase();
    let labelText = `<${tag}>`;
    // Utility-class pages (Tailwind) can carry dozens of classes; a few are
    // enough to recognise the element without the label spanning the page.
    if (currentCssClasses.length > 0) {
      const shown = currentCssClasses.slice(0, MAX_LABEL_CLASSES);
      labelText += ` .${shown.join('.')}${currentCssClasses.length > shown.length ? '…' : ''}`;
    }
    if (currentComponentName) {
      labelText += ` in ${currentComponentName}`;
    }
    if (currentSourcePath) {
      labelText += ` \u2014 ${currentSourcePath}`;
    }
    label.textContent = labelText;

    // Position label above the element, or below if no room
    const labelHeight = 20;
    const gap = 4;
    let labelTop = rect.top - labelHeight - gap;
    if (labelTop < 0) {
      labelTop = rect.bottom + gap;
    }

    // Clamp label horizontally to viewport
    let labelLeft = rect.left;
    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;
    label.style.display = 'block';

    // After rendering, check if it overflows right edge
    const labelRect = label.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    if (labelRect.right > viewportWidth) {
      labelLeft = Math.max(0, viewportWidth - labelRect.width);
      label.style.left = `${labelLeft}px`;
    }
  }

  function trackPosition(): void {
    positionOverlay();
    rafId = requestAnimationFrame(trackPosition);
  }

  function stopTracking(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  return {
    show(element: Element, componentName: string | null, sourcePath?: string | null, cssClasses?: string[]): void {
      ensureElements();
      currentElement = element;
      currentComponentName = componentName;
      currentSourcePath = sourcePath ?? null;
      currentCssClasses = cssClasses ?? [];
      stopTracking();
      trackPosition();
    },

    hide(): void {
      stopTracking();
      currentElement = null;
      currentComponentName = null;
      currentSourcePath = null;
      currentCssClasses = [];

      if (overlay) overlay.style.display = 'none';
      if (label) label.style.display = 'none';
    },

    isOverlayElement(el: Element): boolean {
      return el === overlay || el === label || el.id === OVERLAY_ID || el.id === LABEL_ID;
    },

    dispose(): void {
      stopTracking();
      currentElement = null;
      currentComponentName = null;
      currentSourcePath = null;
      currentCssClasses = [];

      overlay?.remove();
      label?.remove();
      removeStyles(STYLE_ID);
      overlay = null;
      label = null;
    },
  };
}
