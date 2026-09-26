export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function filterAngularClasses(classList: DOMTokenList): string[] {
  return Array.from(classList).filter(c => !c.startsWith('ng-') && !c.startsWith('_ng'));
}

const NG_ATTR_RE = /\s_ng(host|content)-[a-z0-9-]+="[^"]*"/gi;
const NG_ATTR_EMPTY_RE = /\s_ng(host|content)-[a-z0-9-]+/gi;

export function cleanAngularAttrs(html: string): string {
  return html.replace(NG_ATTR_RE, '').replace(NG_ATTR_EMPTY_RE, '');
}
