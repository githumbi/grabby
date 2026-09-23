import type { Plugin, ElementContext } from '../types';

export const DEFAULT_WEBHOOK_URL = 'http://localhost:3456/grab';

export function createMcpWebhookPlugin(url: string = DEFAULT_WEBHOOK_URL): Plugin {
  return {
    name: 'mcp-webhook',
    hooks: {
      onCopySuccess(snippet: string, context: ElementContext, comment?: string) {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: context.html,
            componentName: context.componentName,
            filePath: context.filePath,
            line: context.line,
            column: context.column,
            selector: context.selector,
            cssClasses: context.cssClasses,
            snippet,
            comment: comment ?? null,
            pageUrl: typeof location !== 'undefined' ? location.href : null,
            componentStack: context.componentStack.map((c) => ({
              name: c.name,
              filePath: c.filePath,
              line: c.line,
              column: c.column,
            })),
          }),
        }).catch(() => {});
      },
    },
  };
}
