import type { OverlayRenderer } from '../overlay/overlay-renderer';
import type { Crosshair } from '../overlay/crosshair';
import type { ComponentResolver, SourceResolver } from '../types';
import { filterAngularClasses } from '../utils';
import { promoteTarget } from '../capture/kind';
import { eventTarget } from '../ui/root';
import { IGNORE_ATTR } from '../capture/preview';

export interface ElementPicker {
  activate(): void;
  deactivate(): void;
  /**
   * Pin the highlight to `element` while its comment is being written: the
   * mouse no longer moves it, and clicks on the page can't pick another one.
   */
  hold(element: Element): void;
  /** Back to picking with the mouse. */
  release(): void;
  isHolding(): boolean;
  getHoveredElement(): Element | null;
  dispose(): void;
}

export interface ElementPickerDeps {
  overlay: OverlayRenderer;
  crosshair: Crosshair;
  getComponentResolver: () => ComponentResolver | null;
  getSourceResolver: () => SourceResolver | null;
  isToolbarElement?: (el: Element) => boolean;
  getFreezeElement?: () => HTMLElement | null;
  onHover: (element: Element | null) => void;
  /** `point` is where the click landed, in viewport coordinates. */
  onSelect: (element: Element, point: { x: number; y: number }) => void;
}

export function createElementPicker(deps: ElementPickerDeps): ElementPicker {
  let hoveredElement: Element | null = null;
  let heldElement: Element | null = null;
  let listening = false;

  function resolveComponentName(el: Element): string | null {
    const resolver = deps.getComponentResolver();
    if (!resolver) return null;

    const result = resolver(el);
    return result?.name ?? null;
  }

  function resolveSourcePath(el: Element): string | null {
    const resolver = deps.getSourceResolver();
    if (!resolver) return null;

    const result = resolver(el);
    if (!result?.filePath) return null;

    let path = result.filePath;
    if (result.line != null) {
      path += `:${result.line}`;
    }
    return path;
  }

  function rawElementAtPoint(x: number, y: number): Element | null {
    // Temporarily hide freeze overlay so elementFromPoint can see through it
    const freezeEl = deps.getFreezeElement?.();
    if (freezeEl) freezeEl.style.pointerEvents = 'none';
    const target = document.elementFromPoint(x, y);
    if (freezeEl) freezeEl.style.pointerEvents = 'auto';
    return target;
  }

  /**
   * The element a click means. Icons and labels inside a button resolve to
   * the button (hold Shift to pick the exact inner element), and anything
   * marked data-grabby-ignore can't be picked at all.
   */
  function elementAtPoint(x: number, y: number, exact: boolean): Element | null {
    const raw = rawElementAtPoint(x, y);
    if (!raw || raw.closest(`[${IGNORE_ATTR}]`)) return raw && deps.isToolbarElement?.(raw) ? raw : null;
    return exact ? raw : promoteTarget(raw);
  }

  function showOverlay(target: Element): void {
    const componentName = resolveComponentName(target);
    const sourcePath = resolveSourcePath(target);
    const cssClasses = filterAngularClasses(target.classList);
    deps.overlay.show(target, componentName, sourcePath, cssClasses);
  }

  function handleMouseMove(e: MouseEvent): void {
    if (heldElement) return;
    const target = elementAtPoint(e.clientX, e.clientY, e.shiftKey);
    if (!target || deps.overlay.isOverlayElement(target)) return;
    if (deps.crosshair.isCrosshairElement(target)) return;
    if (deps.isToolbarElement?.(target)) return;
    if (target === hoveredElement) return;

    hoveredElement = target;
    showOverlay(target);
    deps.onHover(target);
  }

  function handleClick(e: MouseEvent): void {
    // Clicks on Grabby's own UI pass through. Check where the event really
    // started: keyboard-activated buttons report clientX/Y 0,0, so a hit test
    // would land on the page and swallow the click.
    const origin = eventTarget(e);
    if (origin && deps.isToolbarElement?.(origin)) return;
    const target = rawElementAtPoint(e.clientX, e.clientY);
    if (target && (deps.isToolbarElement?.(target) || deps.crosshair.isCrosshairElement(target))) return;

    e.preventDefault();
    e.stopPropagation();

    // Mid-comment, a click on the page must not switch the comment to
    // another element; Save or Cancel ends the hold.
    if (heldElement) return;
    if (hoveredElement) {
      deps.onSelect(hoveredElement, { x: e.clientX, y: e.clientY });
    }
  }

  return {
    activate(): void {
      if (listening) return;
      listening = true;
      deps.crosshair.activate();
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
    },

    deactivate(): void {
      if (!listening) return;
      listening = false;
      hoveredElement = null;
      heldElement = null;
      deps.crosshair.hold(false);
      deps.crosshair.deactivate();
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      deps.overlay.hide();
      deps.onHover(null);
    },

    hold(element: Element): void {
      if (!listening) return;
      heldElement = element;
      hoveredElement = element;
      deps.crosshair.hold(true);
      showOverlay(element);
    },

    release(): void {
      if (!heldElement) return;
      heldElement = null;
      deps.crosshair.hold(false);
    },

    isHolding(): boolean {
      return heldElement !== null;
    },

    getHoveredElement(): Element | null {
      return hoveredElement;
    },

    dispose(): void {
      this.deactivate();
    },
  };
}
