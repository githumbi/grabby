import { filterAngularClasses, type ElementContext, type ComponentStackEntry } from '../../core';
import { resolveComponent } from './component-resolver';
import { resolveSource, resolveSourceForComponent } from './source-resolver';

const MAX_HTML_LENGTH = 2000;

export function buildContext(element: Element): ElementContext {
  const compResult = resolveComponent(element);
  const { filePath, line, column } = resolveSource(element);
  const html = extractHtml(element);
  const selector = generateSelector(element);

  const cssClasses = filterAngularClasses(element.classList);

  const componentStack: ComponentStackEntry[] = compResult.stack.map((entry) => {
    const src = resolveSourceForComponent(entry.name);
    return {
      name: entry.name,
      filePath: src.filePath,
      line: src.line,
      column: src.column,
    };
  });

  return {
    element,
    html,
    componentName: compResult.name,
    filePath,
    line,
    column,
    componentStack,
    selector,
    cssClasses,
  };
}

function extractHtml(element: Element): string {
  const html = element.outerHTML;
  if (html.length <= MAX_HTML_LENGTH) return html;
  return html.slice(0, MAX_HTML_LENGTH) + '<!-- truncated -->';
}

function generateSelector(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    const className = current.getAttribute('class');
    if (className) {
      const classes = className
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3);
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }

    // Add nth-of-type if there are sibling elements with the same tag
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ');
}
