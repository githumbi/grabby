import type { ElementContext } from '../types';
import { cleanAngularAttrs } from '../utils';

const MAX_TEXT_LEN = 60;

function serializeElement(el: Element, depth: number): string {
  const indent = '  '.repeat(depth);
  const tag = el.tagName.toLowerCase();
  const attrs = Array.from(el.attributes)
    .map(a => ` ${a.name}="${a.value}"`)
    .join('');

  const children = Array.from(el.childNodes);
  if (children.length === 0) return `${indent}<${tag}${attrs}></${tag}>`;

  if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
    let text = (children[0] as Text).textContent ?? '';
    if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN) + '…';
    return `${indent}<${tag}${attrs}>${text}</${tag}>`;
  }

  const lines: string[] = [`${indent}<${tag}${attrs}>`];
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      let text = (child as Text).textContent?.trim() ?? '';
      if (!text) continue;
      if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN) + '…';
      lines.push(`${indent}  ${text}`);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      lines.push(serializeElement(child as Element, depth + 1));
    }
  }
  lines.push(`${indent}</${tag}>`);
  return lines.join('\n');
}

function prettyHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Only pretty-print single-root HTML (outerHTML always is); fall back otherwise
    if (doc.body.children.length !== 1) return html;
    return serializeElement(doc.body.firstElementChild!, 0);
  } catch {
    return html;
  }
}

function truncateHtml(html: string, maxLines: number): string {
  const lines = html.split('\n');
  if (lines.length <= maxLines) return html;
  return lines.slice(0, maxLines).join('\n') + '\n  ...';
}

function formatLocation(name: string | null, filePath: string | null, line: number | null, column: number | null): string {
  let loc = '';
  if (name) loc += `in ${name}`;
  if (filePath) {
    const fileName = filePath.split('/').pop() ?? filePath;
    const lineCol = line != null ? `:${line}` : '';
    loc += loc ? ` \u2014 ${fileName}${lineCol}` : `\u2014 ${fileName}${lineCol}`;
  }
  return loc;
}

export function generateSnippet(context: ElementContext, maxContextLines: number): string {
  const cleaned = prettyHtml(cleanAngularAttrs(context.html));
  const truncated = truncateHtml(cleaned, maxContextLines);

  const parts: string[] = [truncated];

  if (context.componentStack.length > 0) {
    for (const entry of context.componentStack) {
      parts.push(formatLocation(entry.name, entry.filePath, entry.line, entry.column));
    }
  } else if (context.componentName || context.filePath) {
    parts.push(formatLocation(context.componentName, context.filePath, context.line, context.column));
  }

  return parts.join('\n');
}
