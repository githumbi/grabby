import { addStyles, hasStyles, removeStyles, getUiRoot } from '../ui/root';
import { Z_INDEX_TOAST } from '../constants';
import { h, svgIcon } from '../ui/dom';
import { ICON_CHECK_CIRCLE } from '../toolbar/toolbar-icons';

const TOAST_ID = '__grabby-toast__';
const TOAST_STYLE_ID = '__grabby-toast-styles__';

// Note: toast state is shared across instances (module-level singleton)
let activeTimer: ReturnType<typeof setTimeout> | null = null;

export interface ToastDetail {
  componentName: string | null;
  filePath: string | null;
  line: number | null;
  column: number | null;
  cssClasses?: string[];
}

function injectToastStyles(): void {
  if (hasStyles(TOAST_STYLE_ID)) return;

  addStyles(TOAST_STYLE_ID, `
    #${TOAST_ID} {
      position: fixed;
      bottom: var(--grabby-toast-bottom, 24px);
      left: 50%;
      transform: translateX(-50%) translateY(100%);
      z-index: ${Z_INDEX_TOAST};
      background: var(--grabby-toast-bg, #ffffff);
      color: var(--grabby-toast-text, #334155);
      font: 500 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 8px 24px var(--grabby-toast-shadow, rgba(0, 0, 0, 0.12));
      pointer-events: none;
      opacity: 0;
      transition: transform 0.25s ease, opacity 0.25s ease;
      letter-spacing: 0.01em;
      max-width: 480px;
      min-width: 260px;
    }
    #${TOAST_ID}.grabby-toast-visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    #${TOAST_ID} .grabby-toast-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 0;
    }
    #${TOAST_ID} .grabby-toast-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
    }
    #${TOAST_ID} .grabby-toast-title {
      font-weight: 600;
      color: var(--grabby-toast-title, #334155);
    }
    #${TOAST_ID} .grabby-toast-details {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    }
    #${TOAST_ID} .grabby-toast-row {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    #${TOAST_ID} .grabby-toast-label {
      color: var(--grabby-toast-label, #64748b);
      flex-shrink: 0;
      min-width: 72px;
    }
    #${TOAST_ID} .grabby-toast-value {
      color: var(--grabby-toast-text, #334155);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${TOAST_ID} .grabby-toast-file-link {
      color: var(--grabby-toast-text, #334155);
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: auto;
      cursor: pointer;
    }
    #${TOAST_ID} .grabby-toast-file-link:hover {
      text-decoration: underline;
      color: var(--grabby-accent, #2563eb);
    }
  `);
}

let toastEl: HTMLDivElement | null = null;

function getOrCreateToast(): HTMLDivElement {
  if (toastEl?.isConnected) return toastEl;
  injectToastStyles();
  toastEl = h('div', { id: TOAST_ID, role: 'status', 'aria-live': 'polite' });
  getUiRoot().appendChild(toastEl);
  return toastEl;
}

function vsCodeUri(filePath: string, line: number | null, column: number | null): string {
  let uri = `vscode://file/${encodeURI(filePath)}`;
  if (line != null) uri += `:${line}`;
  if (line != null && column != null) uri += `:${column}`;
  return uri;
}

function row(label: string, value: Node | string): HTMLDivElement {
  return h('div', { class: 'grabby-toast-row' },
    h('span', { class: 'grabby-toast-label' }, label),
    typeof value === 'string' ? h('span', { class: 'grabby-toast-value' }, value) : value,
  );
}

export function showToast(message: string, detail?: ToastDetail, durationMs = 3500): void {
  const toast = getOrCreateToast();

  const children: Node[] = [
    h('div', { class: 'grabby-toast-header' },
      svgIcon(ICON_CHECK_CIRCLE, 'grabby-toast-icon'),
      h('span', { class: 'grabby-toast-title' }, message),
    ),
  ];

  if (detail) {
    const details = h('div', { class: 'grabby-toast-details' });
    if (detail.componentName) details.appendChild(row('Component', detail.componentName));
    if (detail.filePath) {
      const loc = detail.line != null ? `${detail.filePath}:${detail.line}` : detail.filePath;
      details.appendChild(row('File', h('a', {
        class: 'grabby-toast-file-link',
        href: vsCodeUri(detail.filePath, detail.line, detail.column),
        title: 'Open in VS Code',
      }, loc)));
    }
    if (detail.cssClasses && detail.cssClasses.length > 0) {
      details.appendChild(row('Classes', detail.cssClasses.map((c) => `.${c}`).join(' ')));
    }
    children.push(details);
  }

  toast.replaceChildren(...children);

  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }

  // Force reflow to restart animation if already visible
  toast.classList.remove('grabby-toast-visible');
  void toast.offsetHeight;

  toast.classList.add('grabby-toast-visible');

  activeTimer = setTimeout(() => {
    toast.classList.remove('grabby-toast-visible');
    activeTimer = null;
  }, durationMs);
}

export function disposeToast(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
  toastEl?.remove();
  toastEl = null;
  removeStyles(TOAST_STYLE_ID);
}
