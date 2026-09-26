/**
 * Every piece of Grabby UI lives inside one `<grabby-root>` element with an
 * open shadow root. That keeps host-page CSS out of the toolbar, keeps our CSS
 * out of the page, and gives the picker a single node to ignore.
 *
 * Styles go through constructable stylesheets where the browser has them:
 * CSSOM writes aren't subject to a `style-src` CSP, so Grabby works on pages
 * that forbid inline `<style>`. Where they're missing (older browsers, jsdom)
 * we fall back to `<style>` elements, carrying a nonce if one was configured.
 */

export const HOST_TAG = 'grabby-root';

type StyleTarget = 'shadow' | 'document';

interface StyleRecord {
  target: StyleTarget;
  css: string;
  sheet?: CSSStyleSheet;
  el?: HTMLStyleElement;
}

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let styleNonce: string | undefined;
const styles = new Map<string, StyleRecord>();

function supportsConstructable(target: Document | ShadowRoot): boolean {
  try {
    return 'adoptedStyleSheets' in target
      && typeof CSSStyleSheet === 'function'
      && typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === 'function';
  } catch {
    return false;
  }
}

/** Nonce applied to fallback `<style>` elements, for strict CSPs without constructable stylesheets. */
export function setStyleNonce(nonce: string | undefined): void {
  styleNonce = nonce;
}

export function getUiRoot(): ShadowRoot {
  if (root && host?.isConnected) return root;
  host = document.createElement(HOST_TAG);
  host.setAttribute('data-grabby-ignore', '');
  root = host.attachShadow({ mode: 'open' });
  // Appended to <html> rather than <body> so apps that replace body content
  // don't take the toolbar with them.
  document.documentElement.appendChild(host);
  // A new host (first use, or the old one was removed from the page) needs
  // its shadow styles attached again.
  for (const [id, rec] of Array.from(styles)) {
    if (rec.target !== 'shadow') continue;
    styles.delete(id);
    addStyles(id, rec.css);
  }
  return root;
}

export function getUiHost(): HTMLElement | null {
  return host;
}

/** Adds (or replaces) a stylesheet by id, inside the UI shadow root by default. */
export function addStyles(id: string, css: string, target: StyleTarget = 'shadow'): void {
  const existing = styles.get(id);
  if (existing) {
    existing.css = css;
    if (existing.sheet) existing.sheet.replaceSync(css);
    if (existing.el) existing.el.textContent = css;
    return;
  }

  const container: Document | ShadowRoot = target === 'shadow' ? getUiRoot() : document;
  if (supportsConstructable(container)) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    container.adoptedStyleSheets = [...container.adoptedStyleSheets, sheet];
    styles.set(id, { target, css, sheet });
    return;
  }

  const el = document.createElement('style');
  el.setAttribute('data-grabby-style', id);
  if (styleNonce) el.nonce = styleNonce;
  el.textContent = css;
  if (target === 'shadow') getUiRoot().prepend(el);
  else document.head.appendChild(el);
  styles.set(id, { target, css, el });
}

export function hasStyles(id: string): boolean {
  return styles.has(id);
}

export function removeStyles(id: string): void {
  const rec = styles.get(id);
  if (!rec) return;
  styles.delete(id);
  if (rec.el) rec.el.remove();
  if (rec.sheet) {
    const container: Document | ShadowRoot | null = rec.target === 'shadow' ? root : document;
    if (container) {
      container.adoptedStyleSheets = container.adoptedStyleSheets.filter((s) => s !== rec.sheet);
    }
  }
}

/** True for the host element and anything rendered inside the UI shadow root. */
export function isUiNode(node: Node | null | undefined): boolean {
  if (!node || !host) return false;
  if (node === host) return true;
  return node.getRootNode() === root;
}

/**
 * The element an event really started on. Events from inside the shadow root
 * are retargeted to the host by the time document listeners see them.
 */
export function eventTarget(e: Event): Element | null {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  const first = path[0] ?? e.target;
  return first instanceof Element ? first : null;
}

/** document.activeElement, descending into open shadow roots. */
export function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** True for fields a user types into, where shortcuts must stay out of the way. */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    || (el as HTMLElement).isContentEditable === true;
}

/** Looks up a UI element by id inside the shadow root. */
export function queryUi<T extends Element = HTMLElement>(selector: string): T | null {
  return root ? root.querySelector<T>(selector) : null;
}

export function disposeUiRoot(): void {
  for (const id of Array.from(styles.keys())) removeStyles(id);
  host?.remove();
  host = null;
  root = null;
}
