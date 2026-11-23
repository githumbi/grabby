import type { OverlayRenderer } from '../overlay/overlay-renderer';
import type { Crosshair } from '../overlay/crosshair';
import type { GroupOutline, GroupSpec } from '../overlay/group-outline';
import type { AreaBox, ComponentResolver, SourceResolver } from '../types';
import { filterAngularClasses } from '../utils';
import { promoteTarget } from '../capture/kind';
import { eventTarget } from '../ui/root';
import { IGNORE_ATTR } from '../capture/preview';
import { areaWithin, boxFromPoints, containerForBox, elementsInBox, MAX_MEMBERS, type Box } from './region';

export interface ElementPicker {
  activate(): void;
  deactivate(): void;
  /**
   * Pin the highlight to `element` while its comment is being written: the
   * mouse no longer moves it, and clicks on the page can't pick another one.
   * With `group`, the green group outline is shown instead of the blue one.
   */
  hold(element: Element, group?: { spec: GroupSpec; label: string }): void;
  /** Back to picking with the mouse. */
  release(): void;
  isHolding(): boolean;
  getHoveredElement(): Element | null;
  dispose(): void;
}

type Point = { x: number; y: number };

export interface ElementPickerDeps {
  overlay: OverlayRenderer;
  crosshair: Crosshair;
  groupOutline: GroupOutline;
  getComponentResolver: () => ComponentResolver | null;
  getSourceResolver: () => SourceResolver | null;
  isToolbarElement?: (el: Element) => boolean;
  getFreezeElement?: () => HTMLElement | null;
  onHover: (element: Element | null) => void;
  /** `point` is where the click landed, in viewport coordinates. */
  onSelect: (element: Element, point: Point) => void;
  /** Several elements, from a drag or ⌘/Ctrl-clicks. */
  onSelectGroup: (elements: Element[], point: Point) => void;
  /** A drag over empty space: the region, as fractions of the element around it. */
  onSelectArea: (container: Element, area: AreaBox, point: Point) => void;
}

/** A press has to move this far before it becomes a drag. */
const DRAG_PX = 6;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Events a page could act on while Grabby is picking (open a dropdown, start a text selection). */
const PRESS_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart'] as const;

/** ⌘ on a Mac, Ctrl elsewhere (Ctrl-click on a Mac is a right click). */
function addKey(e: MouseEvent | KeyboardEvent): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}

export function createElementPicker(deps: ElementPickerDeps): ElementPicker {
  let hoveredElement: Element | null = null;
  let heldElement: Element | null = null;
  let listening = false;
  /** Where the button went down, until it comes up. */
  let press: Point | null = null;
  let dragBox: Box | null = null;
  let dragFrame: number | null = null;
  let lastPoint: Point = { x: 0, y: 0 };
  /** The click that ends a drag must not also select the element under it. */
  let swallowNextClick = false;
  /** Elements collected with ⌘/Ctrl-click; commented on when the key is released. */
  let collected: Element[] = [];

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

  function isOurs(el: Element): boolean {
    return !!deps.isToolbarElement?.(el) || deps.overlay.isOverlayElement(el) || deps.crosshair.isCrosshairElement(el);
  }

  function showOverlay(target: Element): void {
    const componentName = resolveComponentName(target);
    const sourcePath = resolveSourcePath(target);
    const cssClasses = filterAngularClasses(target.classList);
    deps.overlay.show(target, componentName, sourcePath, cssClasses);
  }

  const countLabel = (n: number) => `${n} element${n === 1 ? '' : 's'}`;

  function showCollected(): void {
    if (collected.length) {
      deps.groupOutline.show({ elements: collected }, `${countLabel(collected.length)} · release ${IS_MAC ? '⌘' : 'Ctrl'} to comment`);
    } else {
      deps.groupOutline.hide();
    }
  }

  function clearCollected(): void {
    if (!collected.length) return;
    collected = [];
    deps.groupOutline.hide();
  }

  // --- Dragging a box ---

  function previewDrag(): void {
    dragFrame = null;
    if (!dragBox) return;
    deps.groupOutline.marquee(dragBox);
    const found = elementsInBox(dragBox, isOurs);
    if (found.length) deps.groupOutline.show({ elements: found }, countLabel(found.length));
    else deps.groupOutline.hide();
  }

  function endDrag(): void {
    dragBox = null;
    if (dragFrame !== null) cancelAnimationFrame(dragFrame);
    dragFrame = null;
    deps.groupOutline.marquee(null);
    deps.groupOutline.hide();
  }

  function finishDrag(point: Point): void {
    const box = dragBox!;
    endDrag();
    const found = elementsInBox(box, isOurs);
    if (found.length === 1) {
      hoveredElement = found[0];
      deps.onSelect(found[0], point);
    } else if (found.length > 1) {
      deps.onSelectGroup(found, point);
    } else {
      const container = containerForBox(box, isOurs);
      deps.onSelectArea(container, areaWithin(container, box), point);
    }
  }

  // --- Event handlers ---

  /**
   * While picking, the page never sees presses: a press would start a text
   * selection, focus a field or open a menu that opens on pointerdown.
   * Listening on window (capture) runs before the page's own handlers.
   */
  function handlePress(e: Event): void {
    const origin = eventTarget(e);
    if (origin && deps.isToolbarElement?.(origin)) return;
    e.stopPropagation();
    // Not on pointerdown: cancelling it would also cancel the mousedown and
    // mouseup that follow. Cancelling mousedown is what stops text selection.
    if (e.type === 'mousedown' || e.type === 'touchstart') e.preventDefault();
    if (heldElement) return;
    const m = e as MouseEvent;
    const down = e.type === 'pointerdown' || e.type === 'mousedown';
    if (down && m.button === 0 && !press) {
      press = { x: m.clientX, y: m.clientY };
      swallowNextClick = false;
    } else if (!down && e.type !== 'touchstart' && press) {
      const point = { x: m.clientX, y: m.clientY };
      const start = press;
      press = null;
      if (dragBox) {
        // The box ends where the button came up, even if no move event reported that point.
        dragBox = boxFromPoints(start, point);
        swallowNextClick = true;
        finishDrag(point);
      }
    }
  }

  function handleMouseMove(e: MouseEvent): void {
    if (heldElement) return;
    lastPoint = { x: e.clientX, y: e.clientY };
    if (press) {
      if (!dragBox && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return;
      if (!dragBox) {
        clearCollected();
        deps.overlay.hide();
        hoveredElement = null;
      }
      dragBox = boxFromPoints(press, lastPoint);
      if (dragFrame === null) dragFrame = requestAnimationFrame(previewDrag);
      return;
    }
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
    if (swallowNextClick) {
      swallowNextClick = false;
      return;
    }
    if (!hoveredElement) return;
    lastPoint = { x: e.clientX, y: e.clientY };
    if (addKey(e)) {
      // Collect (or drop again) and wait for the key to be released.
      const at = collected.indexOf(hoveredElement);
      if (at >= 0) collected.splice(at, 1);
      else if (collected.length < MAX_MEMBERS) collected.push(hoveredElement);
      showCollected();
      return;
    }
    clearCollected();
    deps.onSelect(hoveredElement, lastPoint);
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.key !== (IS_MAC ? 'Meta' : 'Control') || !collected.length || heldElement) return;
    const elements = collected;
    collected = [];
    deps.groupOutline.hide();
    if (elements.length === 1) {
      hoveredElement = elements[0];
      deps.onSelect(elements[0], lastPoint);
    } else {
      deps.onSelectGroup(elements, lastPoint);
    }
  }

  return {
    activate(): void {
      if (listening) return;
      listening = true;
      deps.crosshair.activate();
      for (const type of PRESS_EVENTS) window.addEventListener(type, handlePress, { capture: true, passive: false });
      // pointermove too: a page that cancels pointerdown (to keep its menus
      // shut while Grabby picks) stops the browser sending mousemove until
      // the button comes up, which would hide every drag from us.
      document.addEventListener('pointermove', handleMouseMove, true);
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);
      window.addEventListener('keyup', handleKeyUp, true);
    },

    deactivate(): void {
      if (!listening) return;
      listening = false;
      hoveredElement = null;
      heldElement = null;
      press = null;
      swallowNextClick = false;
      collected = [];
      endDrag();
      deps.crosshair.hold(false);
      deps.crosshair.deactivate();
      for (const type of PRESS_EVENTS) window.removeEventListener(type, handlePress, true);
      document.removeEventListener('pointermove', handleMouseMove, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      deps.overlay.hide();
      deps.onHover(null);
    },

    hold(element: Element, group?: { spec: GroupSpec; label: string }): void {
      if (!listening) return;
      heldElement = element;
      hoveredElement = element;
      press = null;
      deps.crosshair.hold(true);
      if (group) {
        deps.overlay.hide();
        deps.groupOutline.show(group.spec, group.label);
      } else {
        showOverlay(element);
      }
    },

    release(): void {
      if (!heldElement) return;
      heldElement = null;
      deps.groupOutline.hide();
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
