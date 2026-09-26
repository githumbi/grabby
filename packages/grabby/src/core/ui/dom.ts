/**
 * Tiny DOM builder. All text goes through textContent and all attributes
 * through setAttribute, so user comments, component names and file paths can
 * never be parsed as markup. No innerHTML anywhere means Grabby also runs on
 * pages that enforce Trusted Types.
 */

type Child = Node | string | number | null | undefined | false;

export interface Props {
  [key: string]: unknown;
  class?: string;
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
}

function appendChildren(el: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') {
        el.className = String(value);
      } else if (key === 'style') {
        Object.assign(el.style, value);
      } else if (key === 'dataset') {
        Object.assign(el.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key in el && typeof value !== 'string') {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  appendChildren(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface IconShape {
  /** SVG element name: path, circle, rect, line, polyline. */
  tag: string;
  attrs: Record<string, string>;
}

export interface IconSpec {
  viewBox?: string;
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  shapes: IconShape[];
}

/** Builds an SVG icon with createElementNS; no markup parsing involved. */
export function svgIcon(spec: IconSpec, className?: string): SVGSVGElement {
  const size = String(spec.size ?? 16);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', spec.viewBox ?? '0 0 16 16');
  svg.setAttribute('fill', spec.fill ?? 'none');
  svg.setAttribute('aria-hidden', 'true');
  if (spec.stroke !== undefined || spec.fill === undefined) {
    svg.setAttribute('stroke', spec.stroke ?? 'currentColor');
    svg.setAttribute('stroke-width', spec.strokeWidth ?? '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
  }
  if (className) svg.setAttribute('class', className);
  for (const shape of spec.shapes) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    for (const [k, v] of Object.entries(shape.attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

/** Shorthand for an icon made only of stroked paths. */
export function paths(...d: string[]): IconShape[] {
  return d.map((value) => ({ tag: 'path', attrs: { d: value } }));
}
